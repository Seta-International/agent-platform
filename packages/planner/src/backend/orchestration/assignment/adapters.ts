import type { SpecializedAgentRunCtx } from '@seta/agent-sdk';
import { withGatedMutation } from '@seta/core/events';
import { buildActorSession, listUsers } from '@seta/identity';
import { getPersonSkills, matchUsersToTopic, readPresence } from '@seta/people';
import type { NodeTx } from '@seta/shared-db';
import { eq } from 'drizzle-orm';
import { taskAssignments } from '../../db/schema.ts';
import { assignTask } from '../../domain/assign-task.ts';
import { getTask } from '../../domain/get-task.ts';
import { listDistinctLabels } from '../../domain/list-distinct-labels.ts';
import { listTasks } from '../../domain/list-tasks.ts';
import { listTasksByLabel } from '../../domain/list-tasks-by-label.ts';
import {
  getTaskGroupId,
  listActiveGroupMemberProfiles,
  listTaskAssigneeUserIds,
} from '../../read-helpers.ts';
import type {
  AssignPort,
  AvailabilityPort,
  SkillSearchPort,
  TaskAssigneesPort,
  TaskReaderPort,
  TaskSearchPort,
  UserProfilePort,
} from './ports.ts';
import type { CandidateSkills } from './skill-fit.ts';

// ---- TaskReader: planner.getTask under an actor session ----
export function makeTaskReader(): TaskReaderPort {
  return {
    async load(taskId, ctx) {
      const session = await buildActorSession({ user_id: ctx.actorUserId });
      try {
        const t = await getTask({ task_id: taskId, session });
        return {
          taskId: t.id,
          title: t.title,
          description: t.description ?? null,
          // TaskDetailRow carries plan_id, not a group id, and the pipeline never
          // reads groupId (the analyzer only uses title/description/labels). Left
          // blank rather than firing a second query for an unused field.
          groupId: '',
          labels: t.labels.map((l) => l.name),
        };
      } catch {
        return null;
      }
    },
  };
}

// ---- TaskSearch: planner.listTasksByLabel (deterministic, case-insensitive) ----
const TASK_SEARCH_DEFAULT_LIMIT = 20;

export function makeTaskSearch(): TaskSearchPort {
  return {
    async byLabels(names, limit, ctx, completionStatus) {
      const session = await buildActorSession({ user_id: ctx.actorUserId });
      const { results } = await listTasksByLabel({
        names,
        completionStatus,
        // Clamp to the domain function's 1..50 contract; default 20 when unset.
        limit: Math.min(Math.max(limit || TASK_SEARCH_DEFAULT_LIMIT, 1), 50),
        session,
      });
      return results.map((r) => ({
        taskId: r.taskId,
        title: r.title,
        status: r.status,
        labels: r.labels,
      }));
    },
    async listAvailableLabels(ctx) {
      const session = await buildActorSession({ user_id: ctx.actorUserId });
      return listDistinctLabels({ session });
    },
  };
}

// ---- SkillSearch: people.matchUsersToTopic (vector) ----
// provider + pgVector are the embedding provider + the People person-profile
// PgVector (people_rag), injected by apps/server. matchUsersToTopic queries the
// People vector index and hydrates display fields via a worker join.
export interface SkillSearchDeps {
  provider: Parameters<typeof matchUsersToTopic>[1]['provider'];
  pgVector: Parameters<typeof matchUsersToTopic>[1]['pgVector'];
}

export function makeSkillSearch(deps: SkillSearchDeps): SkillSearchPort {
  return {
    async search({ skills, topK }, ctx) {
      // Match the profile embedding format from buildPersonProfileSource so cosine
      // similarity is computed between semantically aligned texts. A bare
      // skills.join(', ') query scores <0.2 against the rich profile paragraphs.
      const topic = skills.length === 0 ? '' : `Core competencies include ${skills.join(', ')}.`;
      const hits = await matchUsersToTopic(
        { topic, tenant_id: ctx.tenantId, limit: topK, minScore: 0.3 },
        { provider: deps.provider, pgVector: deps.pgVector },
      );
      return hits.map((h) => ({
        userId: h.item.user_id,
        name: h.item.display_name || null,
        skills: h.item.skills,
        role: null,
        similarity: h.score,
      }));
    },
  };
}

// ---- GroupMemberSkills: the task's group members + their People skills ----
// The vector/skill search is tenant-wide and, intersected against a specific
// group, often returns nobody for a small team — especially a task with no
// skill tags. This supplies the group's members (with real skills) as a bounded
// candidate set so skill-fit reasoning always has people to judge.
export type GroupMemberSource = (
  taskId: string,
  ctx: SpecializedAgentRunCtx,
) => Promise<CandidateSkills[]>;

export function makeGroupMemberSkills(): GroupMemberSource {
  return async (taskId, ctx) => {
    const groupId = await getTaskGroupId(ctx.tenantId, taskId);
    if (!groupId) return [];
    const profiles = await listActiveGroupMemberProfiles(ctx.tenantId, groupId);
    if (profiles.length === 0) return [];
    const session = await buildActorSession({ user_id: ctx.actorUserId });
    return Promise.all(
      profiles.map(async (p) => ({
        userId: p.user_id,
        name: p.display_name,
        skills: await getPersonSkills(session, { user_id: p.user_id }),
      })),
    );
  };
}

// ---- UserProfileLookup: identity listUsers (name search) + getUserProfile ----
const PROFILE_LOOKUP_DEFAULT_LIMIT = 5;

export function makeUserProfileLookup(): UserProfilePort {
  return {
    async findByName(name, ctx, limit) {
      const session = await buildActorSession({ user_id: ctx.actorUserId });
      const { rows } = await listUsers(ctx.tenantId, {
        search: name,
        limit: Math.min(Math.max(limit ?? PROFILE_LOOKUP_DEFAULT_LIMIT, 1), 25),
        offset: 0,
      });
      // role is no longer modeled per-user (job role lives on People worker.job_title,
      // which the recommender doesn't consume); skills + availability come from People.
      const profiles = await Promise.all(
        rows.map(async (r) => {
          const [presence, skills] = await Promise.all([
            readPresence(session, { user_id: r.user_id }),
            getPersonSkills(session, { user_id: r.user_id }),
          ]);
          return {
            userId: r.user_id,
            name: r.name,
            role: null,
            skills,
            availability: presence.availability_status,
          };
        }),
      );
      return profiles;
    },
  };
}

// ---- TaskAssignees: the task's current assignee set (planner read-helper, no
// LLM). The candidate sources are tenant-wide and unaware of the task, so the
// pipeline subtracts this set before proposing — a person already on the task is
// never suggested. Tenant-bound read (actor is acting over their own task). ----
export function makeTaskAssignees(): TaskAssigneesPort {
  return {
    async currentAssigneeIds(taskId, ctx) {
      return listTaskAssigneeUserIds(ctx.tenantId, taskId);
    },
  };
}

// ---- Availability: real in-progress count; leave is Phase-A default ----
export function makeAvailability(): AvailabilityPort {
  return {
    // Availability from People presence (worker), read under the actor's session.
    // name is left to the candidate-level fallback (avai-checker uses s.name ?? c.name).
    async status(userId, ctx) {
      const session = await buildActorSession({ user_id: ctx.actorUserId });
      const presence = await readPresence(session, { user_id: userId });
      return {
        status: presence.availability_status,
        name: null,
        note: null,
      };
    },
    async inProgressCount(userId, ctx) {
      const session = await buildActorSession({ user_id: ctx.actorUserId });
      // "In progress" = the MS-Planner mid bucket: started but not complete.
      // percent_complete is an int (0 not started / 50 in progress / 100 done),
      // so gte:1 && lt:100 selects active work assigned to this user.
      const { tasks } = await listTasks({
        session,
        filters: { assignee_id: userId, percent_complete_gte: 1, percent_complete_lt: 100 },
        limit: 200,
      });
      return tasks.length;
    },
  };
}

// ---- Assign: planner's own assignTask domain function, called directly now
// that the orchestration lives inside planner (previously bound in apps/server
// against @seta/planner's public surface). RBAC is re-checked inside assignTask.
//
// The whole loop runs inside ONE withGatedMutation transaction: every assignTask
// joins it through reentrant withEmit, so a mid-loop failure leaves nothing
// written, and a resumeRetry replay returns the recorded result instead of
// assigning a second time. ----
async function snapshotAssignees(
  tx: NodeTx,
  taskId: string,
): Promise<{ assigneeUserIds: string[] }> {
  const rows = await tx
    .select({ user_id: taskAssignments.user_id })
    .from(taskAssignments)
    .where(eq(taskAssignments.task_id, taskId));
  // Sorted so before/after differ only when the SET differs, not on row order.
  return { assigneeUserIds: rows.map((r) => r.user_id).sort() };
}

export function makeAssign(): AssignPort {
  return {
    async assign({ taskId, assigneeUserIds, actorUserId, idempotencyKey }) {
      const session = await buildActorSession({ user_id: actorUserId });
      await withGatedMutation(
        session,
        {
          idempotencyKey,
          onBehalfOf: actorUserId,
          actorKind: 'agent',
          mutationKind: 'assign',
          snapshot: (tx) => snapshotAssignees(tx, taskId),
        },
        async () => {
          for (const userId of assigneeUserIds) {
            await assignTask({ task_id: taskId, user_id: userId, session });
          }
          return { taskId, assigneeUserIds };
        },
      );
    },
  };
}
