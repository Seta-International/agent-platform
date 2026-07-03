import type { AgentResult, SpecializedAgentSpec, TrustEnvelope } from '@seta/agent-sdk';
import type { z } from 'zod';
import type { AvailabilityPort } from '../ports.ts';
import {
  AvaiCheckerInputSchema,
  AvaiCheckerOutputSchema,
  type AvailabilityResult,
} from '../schemas.ts';
import { computeAvailabilityScore } from './avai-checker.score.ts';

type Out = z.infer<typeof AvaiCheckerOutputSchema>;
type In = z.infer<typeof AvaiCheckerInputSchema>;

export interface AvaiCheckerDeps {
  availability: AvailabilityPort;
}

/**
 * Scores each candidate's availability (status + in-progress workload) for a task.
 *
 * Deterministic — no LLM. The two inputs (availability status, in-progress count)
 * are plain reads and the score is a pure function, so an LLM step would add only
 * latency and failure modes (it previously ran as a multi-tool sub-agent that
 * timed out inside the orchestrator's per-tool budget and tripped its circuit
 * breaker). This mirrors the recommender, which is likewise a pure spec.
 */
export function makeAvaiCheckerAgent(deps: AvaiCheckerDeps): SpecializedAgentSpec<In, Out> {
  return {
    id: 'staffing.avaiChecker',
    description:
      'Scores candidate availability (status + in-progress workload) for a task (deterministic).',
    inputSchema: AvaiCheckerInputSchema,
    outputSchema: AvaiCheckerOutputSchema,
    run: async (input, ctx): Promise<AgentResult<Out>> => {
      const availability: AvailabilityResult[] = await Promise.all(
        input.candidates.map(async (c): Promise<AvailabilityResult> => {
          const [s, inProgressCount] = await Promise.all([
            deps.availability.status(c.userId, ctx),
            deps.availability.inProgressCount(c.userId, ctx),
          ]);
          return {
            userId: c.userId,
            // Prefer the identity display name; fall back to the candidate's own.
            name: s.name ?? c.name ?? null,
            status: s.status,
            inProgressCount,
            availabilityScore: computeAvailabilityScore(s.status, inProgressCount),
          };
        }),
      );

      const confidence =
        availability.length === 0
          ? 0
          : availability.reduce((sum, a) => sum + a.availabilityScore, 0) / availability.length;

      const trust: TrustEnvelope = {
        reasoningTrace: [
          {
            step: 'score_availability',
            detail: `scored ${availability.length} candidate(s) by status + in-progress load`,
            at: new Date().toISOString(),
          },
        ],
        evidenceCitations: availability.map((a) => ({
          kind: 'user' as const,
          id: a.userId,
          label: a.name ?? undefined,
        })),
        confidenceScore: Math.max(0, Math.min(1, confidence)),
      };

      return { result: { taskId: input.taskId, availability }, trust };
    },
  };
}
