import { describe, expect, it } from 'vitest';
import { makeSkillMatcherAgent } from '../../../../src/backend/orchestration/agents/skill-matcher.ts';
import type { SkillSearchPort } from '../../../../src/backend/orchestration/ports.ts';

const ctx = { tenantId: 't1', actorUserId: 'a1' };
const skillSearch: SkillSearchPort = {
  async search() {
    return [{ userId: 'u1', name: 'A', skills: ['aws'], role: null, similarity: 0.6 }];
  },
};

describe('skillMatcher agent', () => {
  it('reads candidates from the staffing_rankCandidates tool result + derives trust', async () => {
    const agent = makeSkillMatcherAgent({
      skillSearch,
      resolveModel: () => ({}) as never,
      runAgent: async () => ({
        toolCalls: [
          { payload: { toolName: 'staffing_searchCandidates', args: { skills: ['aws'] } } },
        ],
        toolResults: [
          {
            payload: {
              toolName: 'staffing_searchCandidates',
              result: {
                hits: [{ userId: 'u1', name: 'A', skills: ['aws'], role: null, similarity: 0.6 }],
              },
            },
          },
          {
            payload: {
              toolName: 'staffing_rankCandidates',
              result: {
                candidates: [
                  {
                    userId: 'u1',
                    name: 'A',
                    skills: ['aws'],
                    role: null,
                    skillMatchCount: 1,
                    rank: 1,
                  },
                ],
              },
            },
          },
        ],
      }),
    });
    const res = await agent.run({ taskId: 't-1', skills: ['aws'] }, ctx);
    expect(res.result.taskId).toBe('t-1');
    expect(res.result.candidates[0]?.userId).toBe('u1');
    expect(res.trust.evidenceCitations.some((c) => c.id === 'u1')).toBe(true);
    expect(res.trust.confidenceScore).toBeCloseTo(0.6);
  });

  it('falls back to ranking search hits when staffing_rankCandidates was not called', async () => {
    const agent = makeSkillMatcherAgent({
      skillSearch,
      resolveModel: () => ({}) as never,
      runAgent: async () => ({
        toolCalls: [
          { payload: { toolName: 'staffing_searchCandidates', args: { skills: ['aws'] } } },
        ],
        toolResults: [
          {
            payload: {
              toolName: 'staffing_searchCandidates',
              result: {
                hits: [{ userId: 'u1', name: 'A', skills: ['aws'], role: null, similarity: 0.6 }],
              },
            },
          },
        ],
      }),
    });
    const res = await agent.run({ taskId: 't-1', skills: ['aws'] }, ctx);
    expect(res.result.candidates[0]?.userId).toBe('u1');
    expect(res.result.candidates[0]?.skillMatchCount).toBe(1);
  });
});
