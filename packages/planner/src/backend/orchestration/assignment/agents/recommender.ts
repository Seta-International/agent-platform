import type { AgentResult, SpecializedAgentSpec, TrustEnvelope } from '@seta/agent-sdk';
import type { z } from 'zod';
import {
  type AvailabilityResult,
  type RankedCandidate,
  type Recommendation,
  RecommenderInputSchema,
  RecommenderOutputSchema,
} from '../schemas.ts';
import { literalMatches } from '../skill-fit.ts';

type In = z.infer<typeof RecommenderInputSchema>;
type Out = z.infer<typeof RecommenderOutputSchema>;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Folds availability into the candidate pool and produces the final ranking.
 *
 * Skill fit was already judged ONCE by the skillMatcher (hybrid literal +
 * reasoning) and rides along on `candidate.skillMatch`, so this step is pure
 * data — it does NOT re-match or call an LLM. The literalMatches fallback only
 * covers candidates assembled without a prior fit pass (e.g. test fixtures).
 */
export function makeRecommenderAgent(): SpecializedAgentSpec<In, Out> {
  return {
    id: 'staffing.recommender',
    description:
      'Merges skill candidates with availability and produces the final ranked recommendation.',
    inputSchema: RecommenderInputSchema,
    outputSchema: RecommenderOutputSchema,
    run: async (input, _ctx): Promise<AgentResult<Out>> => {
      const avaiByUser = new Map<string, AvailabilityResult>(
        input.availability.map((a) => [a.userId, a]),
      );

      const recommendations: Recommendation[] = input.candidates
        .map((c: RankedCandidate) => {
          const a = avaiByUser.get(c.userId);
          const skillMatch = c.skillMatch ?? literalMatches(c.skills, input.skills);
          return {
            userId: c.userId,
            name: c.name,
            skillMatch,
            skillMatchCount: skillMatch.length,
            status: a?.status ?? 'busy',
            availabilityScore: a?.availabilityScore ?? 0,
          };
        })
        .sort((a, b) =>
          b.skillMatchCount !== a.skillMatchCount
            ? b.skillMatchCount - a.skillMatchCount
            : b.availabilityScore - a.availabilityScore,
        );

      const top = recommendations[0];
      const trust: TrustEnvelope = {
        reasoningTrace: [
          {
            step: 'merge_rank',
            detail: `${recommendations.length} recommendations; top matches ${top?.skillMatchCount ?? 0} skill(s)`,
            at: new Date().toISOString(),
          },
        ],
        evidenceCitations: recommendations.map((r) => ({
          kind: 'user' as const,
          id: r.userId,
          label: r.name ?? undefined,
        })),
        confidenceScore: top && top.skillMatchCount > 0 ? clamp01(top.skillMatchCount / 3) : 0,
      };

      return { result: { taskId: input.taskId, recommendations }, trust };
    },
  };
}
