import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it } from 'vitest';
import { makeSkillMatcherTools } from '../../../../src/backend/orchestration/agents/skill-matcher.tools.ts';
import type { SkillSearchPort } from '../../../../src/backend/orchestration/ports.ts';

function ctx() {
  const rc = new RequestContext();
  rc.set('tenant_id', 't1');
  rc.set('actor', { type: 'user', user_id: 'a1' });
  return { requestContext: rc } as never;
}

const skillSearch: SkillSearchPort = {
  async search(_args, runCtx) {
    expect(runCtx.tenantId).toBe('t1'); // proves tenant flows from requestContext
    return [
      { userId: 'u1', name: 'A', skills: ['aws'], role: null, similarity: 0.6 },
      { userId: 'u1', name: 'A', skills: ['linux'], role: null, similarity: 0.4 },
      { userId: 'u2', name: 'B', skills: ['python'], role: null, similarity: 0.5 },
    ];
  },
};

/** Records the topK each search was issued with, for limit-pass-through assertions. */
function spySkillSearch() {
  const topKs: number[] = [];
  const port: SkillSearchPort = {
    async search({ topK }) {
      topKs.push(topK);
      return [];
    },
  };
  return { port, topKs };
}

describe('skill-matcher tools', () => {
  it('staffing_searchCandidates returns hits via the port (tenant from requestContext)', async () => {
    const { staffing_searchCandidates } = makeSkillMatcherTools({ skillSearch, topK: 10 });
    const out = (await staffing_searchCandidates.execute!({ skills: ['aws'] } as never, ctx())) as {
      hits: unknown[];
    };
    expect(out.hits).toHaveLength(3);
  });

  it('staffing_searchCandidates defaults topK to the factory value when no limit is given', async () => {
    const spy = spySkillSearch();
    const { staffing_searchCandidates } = makeSkillMatcherTools({
      skillSearch: spy.port,
      topK: 10,
    });
    await staffing_searchCandidates.execute!({ skills: ['aws'] } as never, ctx());
    expect(spy.topKs).toEqual([10]);
  });

  it('staffing_searchCandidates passes a requested limit through as topK', async () => {
    const spy = spySkillSearch();
    const { staffing_searchCandidates } = makeSkillMatcherTools({
      skillSearch: spy.port,
      topK: 10,
    });
    await staffing_searchCandidates.execute!({ skills: ['aws'], limit: 3 } as never, ctx());
    expect(spy.topKs).toEqual([3]);
  });

  it('staffing_rankCandidates merges per user and ranks by overlap then similarity', async () => {
    const { staffing_rankCandidates } = makeSkillMatcherTools({ skillSearch, topK: 10 });
    const out = (await staffing_rankCandidates.execute!(
      {
        requiredSkills: ['aws'],
        hits: [
          { userId: 'u1', name: 'A', skills: ['aws'], role: null, similarity: 0.6 },
          { userId: 'u1', name: 'A', skills: ['linux'], role: null, similarity: 0.4 },
          { userId: 'u2', name: 'B', skills: ['python'], role: null, similarity: 0.5 },
        ],
      } as never,
      ctx(),
    )) as {
      candidates: { userId: string; skillMatchCount: number; rank: number; skills: string[] }[];
    };
    expect(out.candidates[0]?.userId).toBe('u1');
    expect(out.candidates[0]?.skillMatchCount).toBe(1);
    expect(out.candidates[0]?.skills.sort()).toEqual(['aws', 'linux']);
    expect(out.candidates[0]?.rank).toBe(1);
  });
});
