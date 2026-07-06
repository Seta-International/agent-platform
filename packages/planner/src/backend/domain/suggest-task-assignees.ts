import type { SessionScope } from '@seta/core';
import { and, eq, isNull } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { plans, tasks } from '../db/schema.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { defaultAssignBySkillDeps } from '../workflows/assign-by-skill/deps.ts';
import {
  type AssignBySkillDeps,
  computeAssigneeSuggestions,
} from '../workflows/assign-by-skill/workflow.ts';
import { listGroupMembers } from './list-group-members.ts';

export interface AssigneeSuggestion {
  user_id: string;
  display_name: string;
  /** finalScore in [0,1]. */
  score: number;
  skills: string[];
  exact_overlap: number;
  open_task_count: number | null;
  hours_available_this_week: number | null;
  timezone: string | null;
}

/**
 * Inline (non-HITL) assignee suggestions for a task: the assignBySkill ranking
 * pipeline, filtered to the plan's group members (assignTask rejects
 * non-members). RBAC mirrors assignTask: planner.task.assign on the group.
 *
 * `deps` defaults to the real embedding/vector/reranker wiring
 * (`defaultAssignBySkillDeps`), resolved lazily so it is only ever
 * constructed after the RBAC check passes — tests override it to avoid
 * needing a live embedding provider, matching the injectable-deps pattern
 * used by `computeAssigneeSuggestions` itself.
 */
export async function suggestTaskAssignees(
  input: {
    task_id: string;
    session: SessionScope;
  },
  deps?: AssignBySkillDeps,
): Promise<AssigneeSuggestion[]> {
  const db = plannerDb();

  const [taskRow] = await db
    .select({ plan_id: tasks.plan_id, tenant_id: tasks.tenant_id })
    .from(tasks)
    .where(and(eq(tasks.id, input.task_id), isNull(tasks.deleted_at)))
    .limit(1);
  if (!taskRow) throw new PlannerError('NOT_FOUND', 'Task not found', { task_id: input.task_id });
  if (taskRow.tenant_id !== input.session.tenant_id) {
    throw new PlannerError('CROSS_TENANT', 'Task belongs to another tenant', {
      task_id: input.task_id,
    });
  }

  const [plan] = await db
    .select({ group_id: plans.group_id })
    .from(plans)
    .where(eq(plans.id, taskRow.plan_id))
    .limit(1);
  if (!plan) {
    throw new PlannerError('NOT_FOUND', 'Parent plan not found', { plan_id: taskRow.plan_id });
  }

  await requirePermission(input.session, 'planner.task.assign', plan.group_id);

  const { candidates } = await computeAssigneeSuggestions(
    {
      taskId: input.task_id,
      session: {
        tenantId: input.session.tenant_id,
        userId: input.session.user_id,
        roleSummary: input.session.role_summary,
      },
    },
    deps ?? defaultAssignBySkillDeps(),
  );

  const { members } = await listGroupMembers({
    group_id: plan.group_id,
    limit: 500,
    session: input.session,
  });
  const memberIds = new Set(members.map((m) => m.user_id));

  return candidates
    .filter((c) => memberIds.has(c.userId))
    .map((c) => ({
      user_id: c.userId,
      display_name: c.displayName,
      score: c.finalScore,
      skills: c.skills,
      exact_overlap: c.exactOverlap,
      open_task_count: c.openTaskCount,
      hours_available_this_week: c.hoursAvailableThisWeek,
      timezone: c.timezone,
    }));
}
