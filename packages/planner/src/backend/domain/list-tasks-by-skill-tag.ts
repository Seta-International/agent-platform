import type { SessionScope } from '@seta/core';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { plans, taskAssignments, tasks } from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';

export interface ListTasksBySkillTagInput {
  /** Skill tags to match (OR / overlap), case-insensitive. Must be non-empty. */
  tags: string[];
  /** "open" = incomplete (percent_complete < 100); "completed" = done; "any" = all. Default "any". */
  completionStatus?: 'open' | 'completed' | 'any';
  /** Max rows to return. Caller is responsible for clamping. */
  limit: number;
  session: SessionScope;
}

export interface ListTasksBySkillTagRow {
  taskId: string;
  groupId: string;
  title: string;
  status: 'not_started' | 'in_progress' | 'completed';
  percentComplete: number;
  assigneeUserIds: string[];
  skillTags: string[];
  createdAt: string;
}

function statusOf(pc: number): 'not_started' | 'in_progress' | 'completed' {
  return pc >= 100 ? 'completed' : pc > 0 ? 'in_progress' : 'not_started';
}

export async function listTasksBySkillTag(
  input: ListTasksBySkillTagInput,
): Promise<{ results: ListTasksBySkillTagRow[] }> {
  requirePermission(input.session, 'planner.task.read');

  if (input.tags.length === 0) return { results: [] };

  const db = plannerDb();
  const groupFilter = groupFilterFor(input.session);
  // Non-admin with no accessible groups sees nothing.
  if (groupFilter !== null && groupFilter.length === 0) return { results: [] };

  const conditions = [eq(tasks.tenant_id, input.session.tenant_id), isNull(tasks.deleted_at)];

  const cs = input.completionStatus ?? 'any';
  if (cs === 'open') conditions.push(sql`${tasks.percent_complete} < 100`);
  if (cs === 'completed') conditions.push(sql`${tasks.percent_complete} = 100`);

  if (groupFilter !== null) {
    conditions.push(
      inArray(
        tasks.plan_id,
        db
          .select({ id: plans.id })
          .from(plans)
          .where(inArray(plans.group_id, [...groupFilter])),
      ),
    );
  }

  // Case-insensitive overlap: lower(stored tag) matches any lowered query tag.
  // Build the ARRAY[...] literal inline (escape ') so postgres receives an explicit
  // text[] value rather than a scalar param, mirroring list-tasks.ts:277-280. The
  // EXISTS(... FROM unnest ...) subquery names no module schema, so lint:raw-sql passes.
  const loweredTags = sql.raw(
    `ARRAY[${input.tags.map((t) => `'${t.toLowerCase().replace(/'/g, "''")}'`).join(',')}]::text[]`,
  );
  // Relevance = how many of the requested tags the task carries. Used both to
  // filter (>0) and to rank, so truncating to `limit` keeps the best matches
  // rather than the most-recently-updated ones.
  const matchCount = sql<number>`(SELECT count(DISTINCT lower(st)) FROM unnest(${tasks.skill_tags}) AS st WHERE lower(st) = ANY(${loweredTags}))`;
  conditions.push(sql`${matchCount} > 0`);

  const rows = await db
    .select({
      id: tasks.id,
      group_id: plans.group_id,
      title: tasks.title,
      percent_complete: tasks.percent_complete,
      skill_tags: tasks.skill_tags,
      created_at: tasks.created_at,
      assignee_ids: sql<
        string[]
      >`COALESCE(ARRAY_AGG(${taskAssignments.user_id}) FILTER (WHERE ${taskAssignments.user_id} IS NOT NULL), ARRAY[]::uuid[])`,
    })
    .from(tasks)
    .innerJoin(plans, eq(plans.id, tasks.plan_id))
    .leftJoin(taskAssignments, eq(taskAssignments.task_id, tasks.id))
    .where(and(...conditions))
    .groupBy(
      tasks.id,
      plans.group_id,
      tasks.title,
      tasks.percent_complete,
      tasks.skill_tags,
      tasks.created_at,
      tasks.updated_at,
    )
    .orderBy(sql`${matchCount} DESC, ${tasks.updated_at} DESC, ${tasks.id} DESC`)
    .limit(input.limit);

  return {
    results: rows.map((r) => ({
      taskId: r.id,
      groupId: r.group_id,
      title: r.title,
      status: statusOf(r.percent_complete ?? 0),
      percentComplete: r.percent_complete ?? 0,
      assigneeUserIds: (r.assignee_ids ?? []).map(String),
      skillTags: r.skill_tags ?? [],
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    })),
  };
}
