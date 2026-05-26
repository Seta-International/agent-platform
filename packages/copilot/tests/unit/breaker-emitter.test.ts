import { describe, expect, it, vi } from 'vitest';
import { buildBreakerEmitter } from '../../src/backend/breaker-emitter.ts';

const samplePayload = {
  tool_id: 'planner.assignTask',
  tenant_id: '00000000-0000-0000-0000-000000000001',
  failure_count: 3,
  opened_at: '2026-05-26T10:00:00.000Z',
  reason: 'timeout' as const,
};

describe('buildBreakerEmitter', () => {
  it('opens a withEmit transaction with the system actor and calls emit', async () => {
    const fakeWithEmit = vi.fn(async (_opts: unknown, body: (tx: unknown) => Promise<void>) => {
      await body({});
    });
    const fakeEmit = vi.fn(async (_event: unknown) => ({ eventId: 'fake' }));

    const emitter = buildBreakerEmitter({
      withEmit: fakeWithEmit as never,
      emit: fakeEmit as never,
    });
    await emitter(samplePayload);

    expect(fakeWithEmit).toHaveBeenCalledTimes(1);
    expect(fakeWithEmit.mock.calls[0]![0]).toMatchObject({
      actor: { userId: 'system', tenantId: samplePayload.tenant_id },
    });
    expect(fakeEmit).toHaveBeenCalledTimes(1);
    const emitted = fakeEmit.mock.calls[0]![0] as Record<string, unknown>;
    expect(emitted).toMatchObject({
      tenantId: samplePayload.tenant_id,
      aggregateType: 'copilot.tool',
      aggregateId: samplePayload.tool_id,
      eventType: 'copilot.tool.breaker_opened',
      eventVersion: 1,
      payload: samplePayload,
    });
  });

  it('swallows underlying errors so SDK fire-and-forget contract holds', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const emitter = buildBreakerEmitter({
      withEmit: vi.fn(async () => {
        throw new Error('db down');
      }) as never,
      emit: vi.fn() as never,
    });
    await expect(emitter(samplePayload)).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
