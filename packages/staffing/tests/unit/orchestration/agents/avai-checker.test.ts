import { describe, expect, it } from 'vitest';
import { makeAvaiCheckerAgent } from '../../../../src/backend/orchestration/agents/avai-checker.ts';
import type { AvailabilityPort } from '../../../../src/backend/orchestration/ports.ts';
import type { RankedCandidate } from '../../../../src/backend/orchestration/schemas.ts';

// avaiChecker is deterministic: it reads status + in-progress load per candidate
// and scores them. No LLM / model — these stubs supply the two real signals.
const availability: AvailabilityPort = {
  async status(userId) {
    return {
      status: userId === 'ooo' ? 'ooo' : 'available',
      name: userId === 'noname' ? null : userId.toUpperCase(),
      note: null,
    };
  },
  async inProgressCount(userId) {
    return userId === 'loaded' ? 6 : 0;
  },
};

const candidate = (userId: string, name: string | null = userId): RankedCandidate => ({
  userId,
  name,
  skills: [],
  role: null,
  skillMatchCount: 0,
  rank: 1,
});

const runCtx = { tenantId: 't1', actorUserId: 'a1' };

describe('avaiChecker (deterministic)', () => {
  it('builds with only the availability port — no model needed', () => {
    const spec = makeAvaiCheckerAgent({ availability });
    expect(spec.id).toBe('staffing.avaiChecker');
  });

  it('scores available+free as 1 and ooo as 0', async () => {
    const spec = makeAvaiCheckerAgent({ availability });
    const res = await spec.run(
      { taskId: 't-1', candidates: [candidate('free'), candidate('ooo')] },
      runCtx,
    );
    const byId = new Map(res.result.availability.map((a) => [a.userId, a]));
    expect(byId.get('free')?.availabilityScore).toBe(1);
    expect(byId.get('free')?.status).toBe('available');
    expect(byId.get('ooo')?.availabilityScore).toBe(0);
    expect(byId.get('ooo')?.status).toBe('ooo');
    expect(res.result.taskId).toBe('t-1');
  });

  it('penalizes in-progress workload (available with 6 in-progress → 0.25)', async () => {
    const spec = makeAvaiCheckerAgent({ availability });
    const res = await spec.run({ taskId: 't-1', candidates: [candidate('loaded')] }, runCtx);
    expect(res.result.availability[0]?.inProgressCount).toBe(6);
    expect(res.result.availability[0]?.availabilityScore).toBeCloseTo(0.25, 5);
  });

  it('uses the identity display name, falling back to the candidate name', async () => {
    const spec = makeAvaiCheckerAgent({ availability });
    const res = await spec.run(
      {
        taskId: 't-1',
        candidates: [candidate('free', 'ignored'), candidate('noname', 'FromCand')],
      },
      runCtx,
    );
    const byId = new Map(res.result.availability.map((a) => [a.userId, a]));
    expect(byId.get('free')?.name).toBe('FREE'); // identity name wins
    expect(byId.get('noname')?.name).toBe('FromCand'); // null identity name → candidate name
  });

  it('emits trust: per-user citations and mean-score confidence', async () => {
    const spec = makeAvaiCheckerAgent({ availability });
    const res = await spec.run(
      { taskId: 't-1', candidates: [candidate('free'), candidate('ooo')] },
      runCtx,
    );
    expect(res.trust.evidenceCitations.map((c) => c.id).sort()).toEqual(['free', 'ooo']);
    expect(res.trust.confidenceScore).toBeCloseTo(0.5, 5); // mean of 1 and 0
  });

  it('returns empty availability for no candidates without throwing', async () => {
    const spec = makeAvaiCheckerAgent({ availability });
    const res = await spec.run({ taskId: 't-1', candidates: [] }, runCtx);
    expect(res.result.availability).toEqual([]);
    expect(res.trust.confidenceScore).toBe(0);
  });
});
