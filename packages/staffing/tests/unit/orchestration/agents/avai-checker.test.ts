import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it } from 'vitest';
import { makeAvaiCheckerTools } from '../../../../src/backend/orchestration/agents/avai-checker.tools.ts';
import { makeAvaiCheckerAgent } from '../../../../src/backend/orchestration/agents/avai-checker.ts';
import type { AvailabilityPort } from '../../../../src/backend/orchestration/ports.ts';

function ctx() {
  const rc = new RequestContext();
  rc.set('tenant_id', 't1');
  rc.set('actor', { type: 'user', user_id: 'a1' });
  return { requestContext: rc } as never;
}

const availability: AvailabilityPort = {
  async status(userId) {
    return {
      status: userId === 'ooo' ? 'ooo' : 'available',
      name: userId.toUpperCase(),
      note: null,
    };
  },
  async inProgressCount(userId) {
    return userId === 'loaded' ? 6 : 0;
  },
};

describe('avaiChecker tools', () => {
  it('checkAvailability returns status + display name per user', async () => {
    const { checkAvailability } = makeAvaiCheckerTools({ availability });
    const out = (await checkAvailability.execute!(
      { userIds: ['free', 'ooo'] } as never,
      ctx(),
    )) as { results: { userId: string; userName: string | null; availability: string }[] };
    expect(out.results).toContainEqual({ userId: 'ooo', userName: 'OOO', availability: 'ooo' });
  });

  it('checkInprogressTasks returns the in-progress count per user', async () => {
    const { checkInprogressTasks } = makeAvaiCheckerTools({ availability });
    const out = (await checkInprogressTasks.execute!(
      { userIds: ['loaded', 'free'] } as never,
      ctx(),
    )) as { results: { userId: string; taskInProgressCount: number }[] };
    expect(out.results.find((r) => r.userId === 'loaded')?.taskInProgressCount).toBe(6);
  });

  it('determineAvaiScore scores free-available as 1 and ooo as 0', async () => {
    const { determineAvaiScore } = makeAvaiCheckerTools({ availability });
    const out = (await determineAvaiScore.execute!(
      {
        items: [
          { userId: 'free', userName: 'F', availability: 'available', taskInProgressCount: 0 },
          { userId: 'ooo', userName: 'O', availability: 'ooo', taskInProgressCount: 0 },
        ],
      } as never,
      ctx(),
    )) as { availability: { userId: string; availabilityScore: number; name: string | null }[] };
    expect(out.availability.find((a) => a.userId === 'free')?.availabilityScore).toBe(1);
    expect(out.availability.find((a) => a.userId === 'ooo')?.availabilityScore).toBe(0);
    expect(out.availability.find((a) => a.userId === 'free')?.name).toBe('F');
  });
});

describe('avaiChecker agent', () => {
  it('returns scored availability from the determineAvaiScore signal', async () => {
    const agent = makeAvaiCheckerAgent({
      availability,
      resolveModel: () => ({}) as never,
      runAgent: async () => ({
        toolCalls: [{ payload: { toolName: 'determineAvaiScore', args: {} } }],
        toolResults: [
          {
            payload: {
              toolName: 'determineAvaiScore',
              result: {
                availability: [
                  {
                    userId: 'free',
                    name: 'F',
                    status: 'available',
                    inProgressCount: 0,
                    availabilityScore: 1,
                  },
                ],
              },
            },
          },
        ],
      }),
    });
    const res = await agent.run(
      {
        taskId: 't-1',
        candidates: [
          { userId: 'free', name: 'F', skills: [], role: null, skillMatchCount: 0, rank: 1 },
        ],
      },
      { tenantId: 't1', actorUserId: 'a1' },
    );
    expect(res.result.availability[0]?.userId).toBe('free');
    expect(res.result.availability[0]?.availabilityScore).toBe(1);
    expect(res.trust.reasoningTrace.length).toBeGreaterThan(0);
  });
});
