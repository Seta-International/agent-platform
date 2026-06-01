import type { AgentResult, Citation, SpecializedAgentSpec, TrustEnvelope } from '@seta/agent-sdk';
import type { z } from 'zod';
import type { SkillSearchHit, SkillSearchPort } from '../ports.ts';
import {
  type RankedCandidate,
  SkillMatcherInputSchema,
  SkillMatcherOutputSchema,
} from '../schemas.ts';

export interface SkillMatcherDeps {
  skillSearch: SkillSearchPort;
  topK?: number;
}

type Out = z.infer<typeof SkillMatcherOutputSchema>;

function countMatches(candidateSkills: string[], required: string[]): number {
  const have = new Set(candidateSkills.map((s) => s.toLowerCase()));
  return required.filter((r) => have.has(r.toLowerCase())).length;
}

export function makeSkillMatcherAgent(
  deps: SkillMatcherDeps,
): SpecializedAgentSpec<{ taskId: string; skills: string[] }, Out> {
  return {
    id: 'staffing.skillMatcher',
    description: 'Finds and ranks candidate users by skill overlap via vector search.',
    inputSchema: SkillMatcherInputSchema,
    outputSchema: SkillMatcherOutputSchema,
    run: async (input, ctx): Promise<AgentResult<Out>> => {
      const hits = await deps.skillSearch.search(
        { skills: input.skills, topK: deps.topK ?? 10 },
        ctx,
      );

      // Merge hits per user: union skills, keep best similarity.
      const byUser = new Map<
        string,
        { hit: SkillSearchHit; bestSim: number; skills: Set<string> }
      >();
      for (const h of hits) {
        const prev = byUser.get(h.userId);
        if (prev) {
          for (const s of h.skills) prev.skills.add(s);
          prev.bestSim = Math.max(prev.bestSim, h.similarity);
        } else {
          byUser.set(h.userId, { hit: h, bestSim: h.similarity, skills: new Set(h.skills) });
        }
      }

      const merged = Array.from(byUser.values()).map((m) => {
        const skills = Array.from(m.skills);
        return {
          userId: m.hit.userId,
          name: m.hit.name,
          skills,
          role: m.hit.role,
          skillMatchCount: countMatches(skills, input.skills),
          bestSim: m.bestSim,
        };
      });

      merged.sort((a, b) =>
        b.skillMatchCount !== a.skillMatchCount
          ? b.skillMatchCount - a.skillMatchCount
          : b.bestSim - a.bestSim,
      );

      const candidates: RankedCandidate[] = merged.map((m, i) => ({
        userId: m.userId,
        name: m.name,
        skills: m.skills,
        role: m.role,
        skillMatchCount: m.skillMatchCount,
        rank: i + 1,
      }));

      const citations: Citation[] = hits.map((h) => ({
        kind: 'user',
        id: h.userId,
        label: h.name ?? undefined,
        score: h.similarity,
      }));
      const topSim = hits.reduce((mx, h) => Math.max(mx, h.similarity), 0);
      const trust: TrustEnvelope = {
        reasoningTrace: [
          {
            step: 'vector_search',
            detail: `${hits.length} hits, ${candidates.length} candidates for ${input.skills.length} skills`,
            at: new Date().toISOString(),
          },
        ],
        evidenceCitations: citations,
        confidenceScore: Math.max(0, Math.min(1, topSim)),
      };

      return { result: { taskId: input.taskId, candidates }, trust };
    },
  };
}
