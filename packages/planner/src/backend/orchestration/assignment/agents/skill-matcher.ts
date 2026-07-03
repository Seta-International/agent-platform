import type { MastraModelConfig } from '@mastra/core/llm';
import type { AgentResult, Citation, SpecializedAgentSpec, TrustEnvelope } from '@seta/agent-sdk';
import type { z } from 'zod';
import type { SkillSearchHit, SkillSearchPort } from '../ports.ts';
import {
  type RankedCandidate,
  SkillMatcherInputSchema,
  SkillMatcherOutputSchema,
} from '../schemas.ts';
import { computeSkillFit, type FitReasoner } from '../skill-fit.ts';

type Out = z.infer<typeof SkillMatcherOutputSchema>;
type In = z.infer<typeof SkillMatcherInputSchema>;

const DEFAULT_TOP_K = 10;

export interface SkillMatcherDeps {
  skillSearch: SkillSearchPort;
  resolveModel: () => MastraModelConfig;
  topK?: number;
  /** Test seam for the skill-fit reasoning fallback; production runs the LLM. */
  judgeFit?: FitReasoner;
}

/** Merge vector-search hits per user, unioning skills and keeping the best similarity. */
function mergeHits(hits: SkillSearchHit[]) {
  const byUser = new Map<string, { hit: SkillSearchHit; bestSim: number; skills: Set<string> }>();
  for (const h of hits) {
    const prev = byUser.get(h.userId);
    if (prev) {
      for (const s of h.skills) prev.skills.add(s);
      prev.bestSim = Math.max(prev.bestSim, h.similarity);
    } else {
      byUser.set(h.userId, { hit: h, bestSim: h.similarity, skills: new Set(h.skills) });
    }
  }
  return Array.from(byUser.values()).map((m) => ({
    userId: m.hit.userId,
    name: m.hit.name,
    role: m.hit.role,
    skills: Array.from(m.skills),
    bestSim: m.bestSim,
  }));
}

/**
 * Finds and ranks candidate users for a task by skill — deterministically.
 *
 * Vector search surfaces the pool; skill fit is judged ONCE (cheap literal
 * overlap, LLM reasoning fallback only for zero-overlap candidates — see
 * computeSkillFit) and reused downstream. No inner LLM tool-routing loop: the
 * search→rank sequence was a fixed pipeline, so it is plain code now.
 */
export function makeSkillMatcherAgent(deps: SkillMatcherDeps): SpecializedAgentSpec<In, Out> {
  return {
    id: 'staffing.skillMatcher',
    description: 'Finds and ranks candidate users by skill fit via vector search (deterministic).',
    inputSchema: SkillMatcherInputSchema,
    outputSchema: SkillMatcherOutputSchema,
    run: async (input, ctx): Promise<AgentResult<Out>> => {
      const topK = deps.topK ?? DEFAULT_TOP_K;
      const hits = await deps.skillSearch.search({ skills: input.skills, topK }, ctx);
      const merged = mergeHits(hits);

      const fit = await computeSkillFit({
        candidates: merged.map((m) => ({ userId: m.userId, name: m.name, skills: m.skills })),
        required: input.skills,
        ctx,
        resolveModel: deps.resolveModel,
        reasoner: deps.judgeFit,
      });

      const candidates: RankedCandidate[] = merged
        .map((m) => {
          const f = fit.get(m.userId);
          return { ...m, skillMatch: f?.skillMatch ?? [], relevanceScore: f?.relevanceScore ?? 0 };
        })
        .sort((a, b) =>
          b.relevanceScore !== a.relevanceScore
            ? b.relevanceScore - a.relevanceScore
            : b.bestSim - a.bestSim,
        )
        .map((m, i) => ({
          userId: m.userId,
          name: m.name,
          skills: m.skills,
          role: m.role,
          skillMatch: m.skillMatch,
          skillMatchCount: m.skillMatch.length,
          rank: i + 1,
        }));

      const citations: Citation[] = candidates.map((c) => ({
        kind: 'user',
        id: c.userId,
        label: c.name ?? undefined,
      }));
      const reasoned = merged.length - candidates.filter((c) => c.skillMatchCount > 0).length;
      const trust: TrustEnvelope = {
        reasoningTrace: [
          {
            step: 'match_candidates',
            detail: `${candidates.length} candidates ranked by skill fit (${reasoned} needed reasoning)`,
            at: new Date().toISOString(),
          },
        ],
        evidenceCitations: citations,
        confidenceScore: hits.reduce((mx, h) => Math.max(mx, h.similarity), 0),
      };

      return { result: { taskId: input.taskId, candidates }, trust };
    },
  };
}
