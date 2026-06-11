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

describe('skill-matcher tools', () => {
  it('staffing_searchCandidates returns hits via the port (tenant from requestContext)', async () => {
    const { staffing_searchCandidates } = makeSkillMatcherTools({ skillSearch, topK: 10 });
    const out = (await staffing_searchCandidates.execute!({ skills: ['aws'] } as never, ctx())) as {
      hits: unknown[];
    };
    expect(out.hits).toHaveLength(3);
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
