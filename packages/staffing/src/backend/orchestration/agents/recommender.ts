import type { AgentResult, SpecializedAgentSpec, TrustEnvelope } from '@seta/agent-sdk';
import type { z } from 'zod';
import {
  type AvailabilityResult,
  type RankedCandidate,
  type Recommendation,
  RecommenderInputSchema,
  RecommenderOutputSchema,
} from '../schemas.ts';

type In = z.infer<typeof RecommenderInputSchema>;
type Out = z.infer<typeof RecommenderOutputSchema>;

function matchedSkills(candidateSkills: string[], required: string[]): string[] {
  const req = new Set(required.map((s) => s.toLowerCase()));
  return candidateSkills.filter((s) => req.has(s.toLowerCase()));
}

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
          return {
            userId: c.userId,
            name: c.name,
            skillMatch: matchedSkills(c.skills, input.skills),
            skillMatchCount: c.skillMatchCount,
            status: a?.status ?? 'busy',
            availabilityScore: a?.availabilityScore ?? 0,
          };
        })
        .sort((a, b) =>
          b.skillMatchCount !== a.skillMatchCount
            ? b.skillMatchCount - a.skillMatchCount
            : b.availabilityScore - a.availabilityScore,
        );

      const topMatch = recommendations[0]?.skillMatchCount ?? 0;
      const trust: TrustEnvelope = {
        reasoningTrace: [
          {
            step: 'merge_rank',
            detail: `${recommendations.length} recommendations; top matches ${topMatch}/${input.skills.length} skills`,
            at: new Date().toISOString(),
          },
        ],
        evidenceCitations: recommendations.map((r) => ({
          kind: 'user' as const,
          id: r.userId,
          label: r.name ?? undefined,
        })),
        confidenceScore: input.skills.length ? Math.min(1, topMatch / input.skills.length) : 0,
      };

      return { result: { taskId: input.taskId, recommendations }, trust };
    },
  };
}
