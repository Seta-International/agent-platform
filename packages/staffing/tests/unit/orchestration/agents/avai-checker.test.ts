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
  async status() {
    return { status: 'available', note: null };
  },
  async inProgressCount(userId) {
    return userId === 'busy' ? 12 : 1;
  },
};

describe('avaiChecker', () => {
  it('tool flags overload (>=10 in-progress) as busy', async () => {
    const { getAvailability } = makeAvaiCheckerTools({ availability });
    const out = (await getAvailability.execute!({ userIds: ['busy', 'free'] } as never, ctx())) as {
      availability: { userId: string; status: string; inProgressCount: number }[];
    };
    expect(out.availability.find((a) => a.userId === 'busy')?.status).toBe('busy');
  });

  it('agent returns availability for the input candidates', async () => {
    const agent = makeAvaiCheckerAgent({
      availability,
      resolveModel: () => ({}) as never,
      runAgent: async () => ({
        toolCalls: [{ payload: { toolName: 'getAvailability', args: {} } }],
        toolResults: [
          {
            payload: {
              toolName: 'getAvailability',
              result: {
                availability: [
                  { userId: 'free', name: null, status: 'available', inProgressCount: 1 },
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
          { userId: 'free', name: null, skills: [], role: null, skillMatchCount: 0, rank: 1 },
        ],
      },
      { tenantId: 't1', actorUserId: 'a1' },
    );
    expect(res.result.availability[0]?.userId).toBe('free');
    expect(res.trust.reasoningTrace.length).toBeGreaterThan(0);
  });
});
