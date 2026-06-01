import { describe, expect, it } from 'vitest';
import { makeSkillMatcherAgent } from '../../../../src/backend/orchestration/agents/skill-matcher.ts';
import type { SkillSearchPort } from '../../../../src/backend/orchestration/ports.ts';

const CTX = { tenantId: 't1', actorUserId: 'u1' };

const search = (hits: Awaited<ReturnType<SkillSearchPort['search']>>): SkillSearchPort => ({
  search: async () => hits,
});

describe('skillMatcher agent', () => {
  it('ranks candidates by skill-match count then similarity, and cites hits', async () => {
    const agent = makeSkillMatcherAgent({
      skillSearch: search([
        { userId: 'u1', name: 'A', skills: ['Terraform', 'AWS'], role: 'senior', similarity: 0.9 },
        { userId: 'u2', name: 'B', skills: ['Terraform'], role: 'dev', similarity: 0.7 },
      ]),
    });
    const res = await agent.run({ taskId: 'task-1', skills: ['terraform', 'aws'] }, CTX);
    const out = res.result as {
      candidates: { userId: string; skillMatchCount: number; rank: number }[];
    };
    expect(out.candidates[0]!.userId).toBe('u1');
    expect(out.candidates[0]!.skillMatchCount).toBe(2);
    expect(out.candidates[0]!.rank).toBe(1);
    expect(out.candidates[1]!.userId).toBe('u2');
    expect(res.trust.evidenceCitations.find((c) => c.id === 'u1')?.score).toBe(0.9);
    expect(res.trust.confidenceScore).toBeCloseTo(0.9, 5);
  });

  it('merges duplicate hits for the same user and unions skills', async () => {
    const agent = makeSkillMatcherAgent({
      skillSearch: search([
        { userId: 'u1', name: 'A', skills: ['Terraform'], role: null, similarity: 0.6 },
        { userId: 'u1', name: 'A', skills: ['AWS'], role: null, similarity: 0.8 },
      ]),
    });
    const res = await agent.run({ taskId: 'task-1', skills: ['terraform', 'aws'] }, CTX);
    const out = res.result as {
      candidates: { userId: string; skills: string[]; skillMatchCount: number }[];
    };
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]!.skills.sort()).toEqual(['AWS', 'Terraform']);
    expect(out.candidates[0]!.skillMatchCount).toBe(2);
  });

  it('returns empty candidates and zero confidence when there are no hits', async () => {
    const agent = makeSkillMatcherAgent({ skillSearch: search([]) });
    const res = await agent.run({ taskId: 'task-1', skills: ['terraform'] }, CTX);
    expect((res.result as { candidates: unknown[] }).candidates).toHaveLength(0);
    expect(res.trust.confidenceScore).toBe(0);
  });
});
