import { describe, expect, it, vi } from 'vitest';
import { makeSkillMatcherAgent } from '../../../../../src/backend/orchestration/assignment/agents/skill-matcher.ts';
import type { SkillSearchPort } from '../../../../../src/backend/orchestration/assignment/ports.ts';
import type {
  FitJudgment,
  FitReasoner,
} from '../../../../../src/backend/orchestration/assignment/skill-fit.ts';

const ctx = { tenantId: 't1', actorUserId: 'a1' } as never;

const noReasoning = vi.fn(async (): Promise<FitJudgment[]> => {
  throw new Error('reasoning should not run when literal overlap exists');
});

describe('skillMatcher agent (deterministic match → fit → rank)', () => {
  it('cheap path: merges hits per user, matches skills literally, no LLM', async () => {
    const skillSearch: SkillSearchPort = {
      async search() {
        return [
          { userId: 'u1', name: 'A', skills: ['aws'], role: null, similarity: 0.6 },
          { userId: 'u1', name: 'A', skills: ['linux'], role: null, similarity: 0.4 },
          { userId: 'u2', name: 'B', skills: ['aws'], role: null, similarity: 0.5 },
        ];
      },
    };
    const agent = makeSkillMatcherAgent({
      skillSearch,
      resolveModel: () => ({}) as never,
      judgeFit: noReasoning,
    });
    const res = await agent.run({ taskId: 't-1', skills: ['aws'] }, ctx);

    // Both match 'aws' literally; u1 wins the similarity tiebreak. Skills unioned across hits.
    expect(res.result.candidates[0]?.userId).toBe('u1');
    expect(res.result.candidates[0]?.skills.sort()).toEqual(['aws', 'linux']);
    expect(res.result.candidates[0]?.skillMatch).toEqual(['aws']);
    expect(res.result.candidates[0]?.skillMatchCount).toBe(1);
    // Fit coverage propagates on the candidate (1 of 1 required area covered).
    expect(res.result.candidates[0]?.relevanceScore).toBe(1);
    expect(res.result.candidates[0]?.rank).toBe(1);
    expect(noReasoning).not.toHaveBeenCalled();
    expect(res.trust.confidenceScore).toBeCloseTo(0.6);
  });

  it('fallback: zero-overlap candidates are sent to reasoning, and the result populates skillMatch', async () => {
    const skillSearch: SkillSearchPort = {
      async search() {
        return [
          {
            userId: 'u1',
            name: 'A',
            skills: ['docker', 'postgresql', 'node.js'],
            role: null,
            similarity: 0.7,
          },
        ];
      },
    };
    const judgeFit = vi.fn<FitReasoner>(async () => [
      { userId: 'u1', relevantSkills: ['docker', 'postgresql'], relevanceScore: 0.8 },
    ]);
    const agent = makeSkillMatcherAgent({
      skillSearch,
      resolveModel: () => ({}) as never,
      judgeFit,
    });
    const res = await agent.run({ taskId: 't-1', skills: ['infrastructure', 'migrations'] }, ctx);
    expect(judgeFit).toHaveBeenCalledOnce();
    expect(judgeFit.mock.calls[0]![0].candidates.map((c) => c.userId)).toEqual(['u1']);
    expect(res.result.candidates[0]?.skillMatch?.sort()).toEqual(['docker', 'postgresql']);
    expect(res.result.candidates[0]?.skillMatchCount).toBe(2);
  });

  it('returns an empty pool when search finds nothing', async () => {
    const skillSearch: SkillSearchPort = {
      async search() {
        return [];
      },
    };
    const agent = makeSkillMatcherAgent({
      skillSearch,
      resolveModel: () => ({}) as never,
      judgeFit: noReasoning,
    });
    const res = await agent.run({ taskId: 't-1', skills: ['aws'] }, ctx);
    expect(res.result.candidates).toEqual([]);
    expect(res.trust.confidenceScore).toBe(0);
  });
});
