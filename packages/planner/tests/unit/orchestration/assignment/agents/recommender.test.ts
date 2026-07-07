import { describe, expect, it } from 'vitest';
import { makeRecommenderAgent } from '../../../../../src/backend/orchestration/assignment/agents/recommender.ts';
import type {
  AvailabilityResult,
  RankedCandidate,
} from '../../../../../src/backend/orchestration/assignment/schemas.ts';

const CTX = { tenantId: 't1', actorUserId: 'u1' } as never;

describe('recommender agent', () => {
  it('reuses the skillMatcher fit (skillMatch) and ranks by it, then availability', async () => {
    // skillMatch already judged upstream (hybrid literal/reasoning) — recommender just folds availability.
    const candidates: RankedCandidate[] = [
      {
        userId: 'u1',
        name: 'A',
        skills: ['Terraform', 'AWS', 'K8s'],
        role: null,
        skillMatch: ['Terraform', 'AWS'],
        skillMatchCount: 2,
        relevanceScore: 1, // covers both required areas
        rank: 1,
      },
      {
        userId: 'u2',
        name: 'B',
        skills: ['Terraform'],
        role: null,
        skillMatch: ['Terraform'],
        skillMatchCount: 1,
        relevanceScore: 0.5, // covers one of two required areas
        rank: 2,
      },
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
    // u1 wins on the blended score: its fit lead (1.0 vs 0.5, weighted 0.7)
    // outweighs u2's availability lead (1 vs 0.1, weighted 0.3).
    // u1 = 0.7*1 + 0.3*0.1 = 0.73 ; u2 = 0.7*0.5 + 0.3*1 = 0.65.
    expect(recs[0]!.userId).toBe('u1');
    expect(recs[0]!.skillMatch.sort()).toEqual(['AWS', 'Terraform']);
    expect(recs[0]!.score).toBeCloseTo(0.73, 5);
    expect(recs[1]!.userId).toBe('u2');
    expect(recs[1]!.score).toBeCloseTo(0.65, 5);
  });

  it('equal skill fit: separates candidates by availability so scores do not all saturate', async () => {
    // Both fully cover the required skill (relevanceScore 1) — the exact scenario
    // where the old availability-only score read 100% for everyone. The blend now
    // pulls the busier candidate down, so the two scores differ.
    const candidates: RankedCandidate[] = [
      {
        userId: 'u1',
        name: 'A',
        skills: ['Terraform'],
        role: null,
        skillMatch: ['Terraform'],
        skillMatchCount: 1,
        relevanceScore: 1,
        rank: 1,
      },
      {
        userId: 'u2',
        name: 'B',
        skills: ['Terraform'],
        role: null,
        skillMatch: ['Terraform'],
        skillMatchCount: 1,
        relevanceScore: 1,
        rank: 2,
      },
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
    // u1 = 0.7*1 + 0.3*0.2 = 0.76 ; u2 = 0.7*1 + 0.3*1 = 1.0.
    expect(recs[0]!.userId).toBe('u2');
    expect(recs[0]!.score).toBeCloseTo(1, 5);
    expect(recs[1]!.userId).toBe('u1');
    expect(recs[1]!.score).toBeCloseTo(0.76, 5);
    // The busier candidate is NOT at 100% — the de-saturation the fix targets.
    expect(recs[1]!.score).toBeLessThan(1);
  });

  it('falls back to literal overlap when a candidate carries no upstream skillMatch', async () => {
    const candidates: RankedCandidate[] = [
      // No skillMatch field (e.g. a hand-built pool) → derive it literally.
      {
        userId: 'u2',
        name: 'B',
        skills: ['Terraform', 'AWS'],
        role: null,
        skillMatchCount: 0,
        relevanceScore: 0,
        rank: 1,
      },
    ];
    const agent = makeRecommenderAgent();
    const res = await agent.run(
      { taskId: 'task-1', skills: ['terraform'], candidates, availability: [] },
      CTX,
    );
    const rec = res.result.recommendations[0]!;
    expect(rec.skillMatch).toEqual(['Terraform']);
    expect(rec.skillMatchCount).toBe(1);
  });

  it('defaults to status busy / score 0 for a candidate missing from availability', async () => {
    const candidates: RankedCandidate[] = [
      {
        userId: 'u2',
        name: 'B',
        skills: ['Terraform'],
        role: null,
        skillMatch: ['Terraform'],
        skillMatchCount: 1,
        relevanceScore: 1,
        rank: 1,
      },
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
