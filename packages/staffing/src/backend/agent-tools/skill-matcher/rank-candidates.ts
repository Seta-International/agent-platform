import { actorFromContext, defineCopilotTool } from '@seta/copilot-sdk';
import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type RankedCandidate = {
  user_id: string;
  name: string | null;
  skills: string[];
  role: string | null;
  skill_match_count: number;
  rank: number;
};

export type RankCandidatesDeps = {
  /**
   * Role priority map — higher number = higher priority.
   * Example: { manager: 3, senior_engineer: 2, developer: 1 }
   * Injected by caller so ranking rules stay outside tool logic.
   */
  rolePriority: Record<string, number>;
  /**
   * Push ranked result to Orchestrator queue.
   * Returns job_id and enqueued_at from the queue backend.
   */
  enqueueForOrchestrator: (params: {
    task_id: string;
    ranked_candidates: RankedCandidate[];
    enqueuedBy: string;
  }) => Promise<{ job_id: string; queue: string; enqueued_at: string }>;
};

// ──────────────────────────────────────────────────────────────────────────────
// Tool 4 (final) of the SkillMatcher pipeline.
//
// Ranking rules (applied in order):
//   1. Role priority  — higher rolePriority value ranks first.
//                       Unknown roles rank last (priority = 0).
//   2. Skill match count — number of skills in candidate.skills that appear
//                          in required_skills (case-insensitive).
//
// After ranking, pushes the result to the Orchestrator queue.
// Output includes job_id so the agent can confirm the enqueue succeeded.
// ──────────────────────────────────────────────────────────────────────────────

export function makeSkillMatcherRankCandidatesTool(deps: RankCandidatesDeps) {
  return defineCopilotTool({
    id: 'skillMatcher_rankCandidates',
    name: 'Rank Skill Candidates',
    description: `
Final tool in the SkillMatcher pipeline.

Ranks candidates from skillMatcher_llmParser by:
  1. Role priority (injected map — higher value = higher priority)
  2. Skill match count (number of candidate skills that match required_skills)

After ranking, pushes the result to the Orchestrator queue.
The Orchestrator then routes to the next agent independently.

Call this once with ALL candidates from skillMatcher_llmParser.
      `.trim(),

    input: z.object({
      task_id: z.string().uuid().describe('Passed through for correlation.'),
      candidates: z
        .array(
          z.object({
            // Fields from CandidateRaw — no invented fields.
            user_id: z.string(),
            name: z.string().nullable(),
            skills: z.array(z.string()),
            role: z.string().nullable(),
          }),
        )
        .min(1)
        .describe('Candidates from skillMatcher_llmParser.'),
      required_skills: z
        .array(z.string())
        .min(1)
        .describe(
          'Skills list for this task_id from the Orchestrator payload. ' +
            'Used to compute skill_match_count per candidate.',
        ),
    }),

    output: z.object({
      // Enqueue confirmation.
      job_id: z.string(),
      queue: z.string(),
      enqueued_at: z.string(),
      // Ranked list — also returned for agent visibility before it ends the turn.
      ranked_candidates: z.array(
        z.object({
          user_id: z.string(),
          name: z.string().nullable(),
          skills: z.array(z.string()),
          role: z.string().nullable(),
          skill_match_count: z.number().int(),
          rank: z.number().int(),
        }),
      ),
      total_candidates: z.number().int(),
    }),

    rbac: 'identity.user.read.any',

    execute: async (input, ctx) => {
      const actor = actorFromContext(ctx);

      // Normalise required skills for case-insensitive matching.
      const required = new Set(input.required_skills.map((s) => s.toLowerCase()));

      // Score each candidate.
      const scored = input.candidates.map((c) => {
        const skill_match_count = c.skills.filter((s) => required.has(s.toLowerCase())).length;

        const rolePriorityScore = c.role !== null ? (deps.rolePriority[c.role] ?? 0) : 0;

        return { ...c, skill_match_count, rolePriorityScore };
      });

      // Sort: role priority DESC → skill_match_count DESC.
      scored.sort((a, b) => {
        if (b.rolePriorityScore !== a.rolePriorityScore) {
          return b.rolePriorityScore - a.rolePriorityScore;
        }
        return b.skill_match_count - a.skill_match_count;
      });

      // Build final ranked list — drop internal rolePriorityScore.
      const ranked_candidates: RankedCandidate[] = scored.map((c, i) => ({
        user_id: c.user_id,
        name: c.name,
        skills: c.skills,
        role: c.role,
        skill_match_count: c.skill_match_count,
        rank: i + 1,
      }));

      // Push to Orchestrator queue.
      const enqueue = await deps.enqueueForOrchestrator({
        task_id: input.task_id,
        ranked_candidates,
        enqueuedBy: actor.user_id,
      });

      return {
        job_id: enqueue.job_id,
        queue: enqueue.queue,
        enqueued_at: enqueue.enqueued_at,
        ranked_candidates,
        total_candidates: ranked_candidates.length,
      };
    },
  });
}
