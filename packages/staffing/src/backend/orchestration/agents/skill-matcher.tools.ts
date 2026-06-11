import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { z } from 'zod';
import type { SkillSearchHit, SkillSearchPort } from '../ports.ts';
import { RankedCandidateSchema } from '../schemas.ts';

export interface SkillMatcherToolDeps {
  skillSearch: SkillSearchPort;
  topK?: number;
}

const HitSchema = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  skills: z.array(z.string()),
  role: z.string().nullable(),
  similarity: z.number(),
});

function tenantOf(ctx: { requestContext?: { get(k: string): unknown } }): string {
  const t = ctx.requestContext?.get('tenant_id');
  if (typeof t !== 'string' || !t)
    throw new Error('skill-matcher tool: missing tenant_id in requestContext');
  return t;
}

function countMatches(candidateSkills: string[], required: string[]): number {
  const have = new Set(candidateSkills.map((s) => s.toLowerCase()));
  return required.filter((r) => have.has(r.toLowerCase())).length;
}

export function makeSkillMatcherTools(deps: SkillMatcherToolDeps) {
  const staffing_searchCandidates = defineAgentTool({
    id: 'staffing_searchCandidates',
    name: 'Search Candidates',
    description:
      'Vector-search users whose profile skills match the required skills.\n\n' +
      'Use for: first step in every candidate-finding flow.\n' +
      'Call once with all required skills; pass results to staffing_rankCandidates.',
    rbac: 'identity.user.read.any',
    input: z.object({ skills: z.array(z.string()).min(1) }),
    output: z.object({ hits: z.array(HitSchema) }),
    execute: async ({ skills }, ctx) => {
      const runCtx = {
        tenantId: tenantOf(ctx),
        actorUserId: actorFromContext(ctx).user_id,
        abortSignal: ctx.abortSignal,
      };
      const hits = await deps.skillSearch.search({ skills, topK: deps.topK ?? 10 }, runCtx);
      return { hits };
    },
  });

  const staffing_rankCandidates = defineAgentTool({
    id: 'staffing_rankCandidates',
    name: 'Rank Candidates',
    description:
      'Merge hits per user and rank by skill overlap then vector similarity.\n\n' +
      'Use for: second step after staffing_searchCandidates.\n' +
      'Pass hits from staffing_searchCandidates and the required skills.',
    input: z.object({ requiredSkills: z.array(z.string()).min(1), hits: z.array(HitSchema) }),
    output: z.object({ candidates: z.array(RankedCandidateSchema) }),
    execute: async ({ requiredSkills, hits }) => {
      const byUser = new Map<
        string,
        { hit: SkillSearchHit; bestSim: number; skills: Set<string> }
      >();
      for (const h of hits as SkillSearchHit[]) {
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
          hit: m.hit,
          skills,
          matches: countMatches(skills, requiredSkills),
          bestSim: m.bestSim,
        };
      });
      merged.sort((a, b) =>
        b.matches !== a.matches ? b.matches - a.matches : b.bestSim - a.bestSim,
      );
      return {
        candidates: merged.map((m, i) => ({
          userId: m.hit.userId,
          name: m.hit.name,
          skills: m.skills,
          role: m.hit.role,
          skillMatchCount: m.matches,
          rank: i + 1,
        })),
      };
    },
  });

  return { staffing_searchCandidates, staffing_rankCandidates };
}
