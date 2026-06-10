import { buildActorSession, getUserProfile, matchUsersToTopic } from '@seta/identity';
import { getTask, listDistinctSkillTags, listTasks, listTasksBySkillTag } from '@seta/planner';
import type { AvailabilityPort, SkillSearchPort, TaskReaderPort, TaskSearchPort } from './ports.ts';

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
          // reads groupId (the analyzer only uses title/description/skillTags). Left
          // blank rather than firing a second query for an unused field.
          groupId: '',
          skillTags: t.skill_tags,
        };
      } catch {
        return null;
      }
    },
  };
}

// ---- TaskSearch: planner.listTasksBySkillTag (deterministic, case-insensitive) ----
const TASK_SEARCH_DEFAULT_LIMIT = 20;

export function makeTaskSearch(): TaskSearchPort {
  return {
    async bySkillTags(tags, limit, ctx, completionStatus) {
      const session = await buildActorSession({ user_id: ctx.actorUserId });
      const { results } = await listTasksBySkillTag({
        tags,
        completionStatus,
        // Clamp to the domain function's 1..50 contract; default 20 when unset.
        limit: Math.min(Math.max(limit || TASK_SEARCH_DEFAULT_LIMIT, 1), 50),
        session,
      });
      return results.map((r) => ({
        taskId: r.taskId,
        title: r.title,
        status: r.status,
        skillTags: r.skillTags,
      }));
    },
    async listAvailableTags(ctx) {
      const session = await buildActorSession({ user_id: ctx.actorUserId });
      return listDistinctSkillTags({ session });
    },
  };
}

// ---- SkillSearch: identity.matchUsersToTopic (vector) ----
// provider + pgVector are the identity embedding provider + the identity user-
// profile PgVector, injected by apps/server (Task 5). matchUsersToTopic queries
// the identity vector index, so the store must be identity's own.
export interface SkillSearchDeps {
  provider: Parameters<typeof matchUsersToTopic>[1]['provider'];
  pgVector: Parameters<typeof matchUsersToTopic>[1]['pgVector'];
}

export function makeSkillSearch(deps: SkillSearchDeps): SkillSearchPort {
  return {
    async search({ skills, topK }, ctx) {
      // Match the profile embedding format from buildUserProfileSource so cosine
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

// ---- Availability: real in-progress count; leave is Phase-A default ----
export function makeAvailability(): AvailabilityPort {
  return {
    // Real availability + display name from identity.user_profile via the identity
    // public surface (no cross-schema read). A user with no profile row defaults to available.
    async status(userId) {
      const profile = await getUserProfile(userId);
      return {
        status: profile?.availability_status ?? 'available',
        name: profile?.display_name ?? null,
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
