import { describe, expect, it } from 'vitest';
import { makeRecommenderAgent } from '../../../../src/backend/orchestration/agents/recommender.ts';
import type {
  AvailabilityResult,
  RankedCandidate,
} from '../../../../src/backend/orchestration/schemas.ts';

const CTX = { tenantId: 't1', actorUserId: 'u1' };

describe('recommender agent', () => {
  it('ranks by skillMatchCount first and reports matched skills only', async () => {
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
      { userId: 'u1', name: 'A', status: 'busy', inProgressCount: 4, availabilityScore: 0.1 },
      { userId: 'u2', name: 'B', status: 'available', inProgressCount: 0, availabilityScore: 1 },
    ];
    const agent = makeRecommenderAgent();
    const res = await agent.run(
      { taskId: 'task-1', skills: ['terraform', 'aws'], candidates, availability },
      CTX,
    );
    const recs = res.result.recommendations;
    // u1 wins on skill count (2 vs 1) even though it is less available.
    expect(recs[0]!.userId).toBe('u1');
    expect(recs[0]!.skillMatch.sort()).toEqual(['AWS', 'Terraform']);
    expect(recs[1]!.userId).toBe('u2');
  });

  it('breaks skillMatchCount ties by availabilityScore (higher first)', async () => {
    const candidates: RankedCandidate[] = [
      { userId: 'u1', name: 'A', skills: ['Terraform'], role: null, skillMatchCount: 1, rank: 1 },
      { userId: 'u2', name: 'B', skills: ['Terraform'], role: null, skillMatchCount: 1, rank: 2 },
    ];
    const availability: AvailabilityResult[] = [
      { userId: 'u1', name: 'A', status: 'busy', inProgressCount: 3, availabilityScore: 0.2 },
      { userId: 'u2', name: 'B', status: 'available', inProgressCount: 0, availabilityScore: 1 },
    ];
    const agent = makeRecommenderAgent();
    const res = await agent.run(
      { taskId: 'task-1', skills: ['terraform'], candidates, availability },
      CTX,
    );
    const recs = res.result.recommendations;
    expect(recs[0]!.userId).toBe('u2');
    expect(recs[0]!.availabilityScore).toBe(1);
    expect(recs[1]!.userId).toBe('u1');
  });

  it('defaults to status busy / score 0 for a candidate missing from availability', async () => {
    const candidates: RankedCandidate[] = [
      { userId: 'u2', name: 'B', skills: ['Terraform'], role: null, skillMatchCount: 1, rank: 1 },
    ];
    const agent = makeRecommenderAgent();
    const res = await agent.run(
      { taskId: 'task-1', skills: ['terraform'], candidates, availability: [] },
      CTX,
    );
    const recs = res.result.recommendations;
    expect(recs[0]!.status).toBe('busy');
    expect(recs[0]!.availabilityScore).toBe(0);
    expect(res.terminal).not.toBe(true);
  });
});
