import { buildActorSession, matchUsersToTopic } from '@seta/identity';
import { getTask, listTasks } from '@seta/planner';
import { generateObject, type LanguageModel } from 'ai';
import { z } from 'zod';
import type {
  AvailabilityPort,
  SkillExtractorPort,
  SkillSearchPort,
  TaskReaderPort,
} from './ports.ts';

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

// ---- SkillExtractor: AI-SDK structured generation (the analyzer's LLM step) ----
const ExtractionSchema = z.object({
  actionable: z.boolean(),
  skills: z.array(z.string()),
  reason: z.string().optional(),
});

export interface LlmSkillExtractorDeps {
  /**
   * Resolves the language model for the extraction call. Injected by the
   * composition root (apps/server) because orchestrator modules may not import
   * the agent engine's model registry (depcruise: only @seta/agent-sdk + the
   * ./rbac, ./events subpaths are reachable). Lazy so env is read at call time.
   */
  resolveModel: () => LanguageModel;
}

export function makeLlmSkillExtractor(deps: LlmSkillExtractorDeps): SkillExtractorPort {
  return {
    async extract({ userText, title, description }) {
      const { object } = await generateObject({
        model: deps.resolveModel(),
        schema: ExtractionSchema,
        prompt: [
          'You gate and analyze chat messages for an assignee-recommendation pipeline.',
          'Decide if the user is asking who should be assigned to / take / own a task.',
          'If NOT such a request, return actionable=false with a short reason.',
          'If it IS, return actionable=true and the concrete skills required for the task.',
          '',
          `User message: ${userText}`,
          `Task title: ${title ?? '(none)'}`,
          `Task description: ${description ?? '(none)'}`,
        ].join('\n'),
      });
      return object;
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
        { topic: skills.join(', '), tenant_id: ctx.tenantId, limit: topK },
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
