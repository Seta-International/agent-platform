import { buildActorSession, matchUsersToTopic } from '@seta/identity';
import { getTask, listTasks } from '@seta/planner';
import type { AvailabilityPort, SkillSearchPort, TaskReaderPort } from './ports.ts';

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
          // reads groupId (the analyzer only uses title/description). Left blank
          // rather than firing a second query for an unused field.
          groupId: '',
        };
      } catch {
        return null;
      }
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
      const hits = await matchUsersToTopic(
        // minScore 0.5 (matchUsersToTopic default) is too high for short skill
        // phrases under text-embedding-3-small and returns no candidates; 0.3
        // surfaces relevant profiles. Tune as needed.
        { topic: skills.join(', '), tenant_id: ctx.tenantId, limit: topK, minScore: 0.3 },
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
    // Phase A: leave/timesheet is not modeled yet (matches the repo's existing
    // getActiveLeave "Phase A: mock" note). Everyone reads as available until
    // the timesheet source lands; this is a documented v1 limitation, not a stub-to-fill.
    async status() {
      return { status: 'available' as const, note: null };
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
