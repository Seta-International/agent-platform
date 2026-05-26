import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetBreakerEmitterForTests,
  type BreakerOpenedEvent,
  emitBreakerOpened,
  setBreakerEventEmitter,
} from '../../src/breaker-events';

const sample: BreakerOpenedEvent = {
  tool_id: 'planner.assignTask',
  tenant_id: '00000000-0000-0000-0000-000000000001',
  failure_count: 3,
  opened_at: '2026-05-26T10:00:00.000Z',
  reason: 'timeout',
};

describe('breaker-events', () => {
  afterEach(() => {
    __resetBreakerEmitterForTests();
    vi.restoreAllMocks();
  });

  it('emitBreakerOpened is a no-op when no emitter is set (boot-order safety)', () => {
    expect(() => emitBreakerOpened(sample)).not.toThrow();
  });

  it('invokes the configured emitter with the event payload', () => {
    const emitter = vi.fn();
    setBreakerEventEmitter(emitter);
    emitBreakerOpened(sample);
    expect(emitter).toHaveBeenCalledTimes(1);
    expect(emitter).toHaveBeenCalledWith(sample);
  });

  it('swallows synchronous emitter exceptions and logs to console.error', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setBreakerEventEmitter(() => {
      throw new Error('boom');
    });
    expect(() => emitBreakerOpened(sample)).not.toThrow();
    expect(errSpy).toHaveBeenCalled();
  });

  it('swallows rejected promises from async emitters and logs', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setBreakerEventEmitter(async () => {
      throw new Error('async boom');
    });
    emitBreakerOpened(sample);
    // Let microtasks flush so the promise rejection is observed.
    await Promise.resolve();
    await Promise.resolve();
    expect(errSpy).toHaveBeenCalled();
  });

  it('does NOT await the emitter (fire-and-forget at the call site)', () => {
    const emitter = vi.fn(() => new Promise<void>(() => {})); // never resolves
    setBreakerEventEmitter(emitter);
    const t0 = Date.now();
    emitBreakerOpened(sample);
    expect(Date.now() - t0).toBeLessThan(50);
    expect(emitter).toHaveBeenCalledTimes(1);
  });
});
