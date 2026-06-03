import { describe, expect, it } from 'vitest';
import { makeRecommenderAgent } from '../../../../src/backend/orchestration/agents/recommender.ts';
import type {
  AvailabilityResult,
  RankedCandidate,
} from '../../../../src/backend/orchestration/schemas.ts';

const CTX = { tenantId: 't1', actorUserId: 'u1' };

const candidates: RankedCandidate[] = [
  {
    userId: 'u1',
    name: 'A',
    skills: ['Terraform', 'AWS', 'K8s'],
    role: null,
    skillMatchCount: 2,
    rank: 1,
  },
  { userId: 'u2', name: 'B', skills: ['Terraform'], role: null, skillMatchCount: 1, rank: 2 },
];
const availability: AvailabilityResult[] = [
  { userId: 'u1', name: 'A', status: 'available', inProgressCount: 1, availabilityScore: 0.79 },
  { userId: 'u2', name: 'B', status: 'busy', inProgressCount: 2, availabilityScore: 0.22 },
];

describe('recommender agent', () => {
  it('ranks by skillMatchCount then status and reports matched skills only', async () => {
    const agent = makeRecommenderAgent();
    const res = await agent.run(
      { taskId: 'task-1', skills: ['terraform', 'aws'], candidates, availability },
      CTX,
    );
    const recs = (res.result as { recommendations: { userId: string; skillMatch: string[] }[] })
      .recommendations;
    expect(recs[0]!.userId).toBe('u1');
    expect(recs[0]!.skillMatch.sort()).toEqual(['AWS', 'Terraform']);
    expect(recs[1]!.userId).toBe('u2');
    expect(res.terminal).not.toBe(true);
  });

  it('defaults status to busy for a candidate missing from availability', async () => {
    const agent = makeRecommenderAgent();
    const res = await agent.run(
      { taskId: 'task-1', skills: ['terraform'], candidates: [candidates[1]!], availability: [] },
      CTX,
    );
    const recs = (res.result as { recommendations: { userId: string; status: string }[] })
      .recommendations;
    expect(recs[0]!.status).toBe('busy');
  });
});
