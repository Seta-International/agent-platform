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

// The displayed/ranking score blends skill fit (primary) with availability
// (secondary) so equally-skilled candidates separate by workload/availability,
// and a fully-free but poor-fit candidate no longer reads as a top match. Fit
// dominates: a full-fit busy candidate still outranks a half-fit idle one.
const RELEVANCE_WEIGHT = 0.7;
const AVAILABILITY_WEIGHT = 0.3;
const blendScore = (relevance: number, availability: number) =>
  clamp01(RELEVANCE_WEIGHT * relevance + AVAILABILITY_WEIGHT * availability);

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
          const availabilityScore = a?.availabilityScore ?? 0;
          const relevanceScore = c.relevanceScore ?? 0;
          return {
            userId: c.userId,
            name: c.name,
            skillMatch,
            skillMatchCount: skillMatch.length,
            status: a?.status ?? 'busy',
            availabilityScore,
            relevanceScore,
            score: blendScore(relevanceScore, availabilityScore),
          };
        })
        // Rank by the blended score; keep skillMatchCount then availability as
        // deterministic tiebreakers so equal-score orderings stay stable.
        .sort((a, b) =>
          b.score !== a.score
            ? b.score - a.score
            : b.skillMatchCount !== a.skillMatchCount
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
        confidenceScore: top?.score ?? 0,
      };

      return { result: { taskId: input.taskId, recommendations }, trust };
    },
  };
}
