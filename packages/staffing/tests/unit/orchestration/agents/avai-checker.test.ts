import { describe, expect, it } from 'vitest';
import { makeAvaiCheckerAgent } from '../../../../src/backend/orchestration/agents/avai-checker.ts';
import type { AvailabilityPort } from '../../../../src/backend/orchestration/ports.ts';
import type { RankedCandidate } from '../../../../src/backend/orchestration/schemas.ts';

const CTX = { tenantId: 't1', actorUserId: 'u1' };

const cand = (userId: string, name: string): RankedCandidate => ({
  userId,
  name,
  skills: ['x'],
  role: null,
  skillMatchCount: 1,
  rank: 1,
});

function port(
  data: Record<string, { status: 'available' | 'busy' | 'ooo'; count: number }>,
): AvailabilityPort {
  return {
    status: async (userId) => ({ status: data[userId]?.status ?? 'busy', note: null }),
    inProgressCount: async (userId) => data[userId]?.count ?? 0,
  };
}

describe('avaiChecker agent', () => {
  it('orders available > busy > ooo', async () => {
    const agent = makeAvaiCheckerAgent({
      availability: port({
        u1: { status: 'ooo', count: 0 },
        u2: { status: 'available', count: 1 },
        u3: { status: 'busy', count: 2 },
      }),
    });
    const res = await agent.run(
      { taskId: 'task-1', candidates: [cand('u1', 'A'), cand('u2', 'B'), cand('u3', 'C')] },
      CTX,
    );
    const ids = (res.result as { availability: { userId: string }[] }).availability.map(
      (a) => a.userId,
    );
    expect(ids).toEqual(['u2', 'u3', 'u1']);
  });

  it('pushes overloaded users (>=10 in-progress) to the end regardless of status', async () => {
    const agent = makeAvaiCheckerAgent({
      availability: port({
        u1: { status: 'available', count: 12 }, // overloaded
        u2: { status: 'busy', count: 1 },
      }),
    });
    const res = await agent.run(
      { taskId: 'task-1', candidates: [cand('u1', 'A'), cand('u2', 'B')] },
      CTX,
    );
    const ids = (res.result as { availability: { userId: string }[] }).availability.map(
      (a) => a.userId,
    );
    expect(ids).toEqual(['u2', 'u1']);
    expect(res.trust.reasoningTrace.some((t) => t.detail.includes('overloaded'))).toBe(true);
  });
});
