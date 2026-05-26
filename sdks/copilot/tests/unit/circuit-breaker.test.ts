import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetBreakerEmitterForTests, setBreakerEventEmitter } from '../../src/breaker-events';
import { __resetBreakersForTests, getBreaker, setBreakerConfig } from '../../src/circuit-breaker';

const TENANT_A = '00000000-0000-0000-0000-00000000000a';
const TENANT_B = '00000000-0000-0000-0000-00000000000b';

describe('circuit-breaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-26T10:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    __resetBreakersForTests();
    __resetBreakerEmitterForTests();
  });

  it('a fresh breaker is closed', () => {
    const b = getBreaker('planner.x', TENANT_A);
    expect(b.isOpen()).toBe(false);
  });

  it('opens after the configured number of consecutive failures (default 3)', () => {
    const b = getBreaker('planner.x', TENANT_A);
    b.recordFailure('timeout');
    b.recordFailure('timeout');
    expect(b.isOpen()).toBe(false);
    b.recordFailure('timeout');
    expect(b.isOpen()).toBe(true);
  });

  it('any success resets the consecutive-failure counter', () => {
    const b = getBreaker('planner.x', TENANT_A);
    b.recordFailure('timeout');
    b.recordFailure('exception');
    b.recordSuccess();
    b.recordFailure('timeout');
    b.recordFailure('timeout');
    expect(b.isOpen()).toBe(false);
    b.recordFailure('timeout');
    expect(b.isOpen()).toBe(true);
  });

  it('per-(tenant, tool) isolation — opening tenant A does not affect tenant B', () => {
    const a = getBreaker('planner.x', TENANT_A);
    const b = getBreaker('planner.x', TENANT_B);
    for (let i = 0; i < 3; i++) a.recordFailure('timeout');
    expect(a.isOpen()).toBe(true);
    expect(b.isOpen()).toBe(false);
  });

  it('per-tool isolation — opening tool X does not affect tool Y for same tenant', () => {
    const x = getBreaker('planner.x', TENANT_A);
    const y = getBreaker('planner.y', TENANT_A);
    for (let i = 0; i < 3; i++) x.recordFailure('timeout');
    expect(x.isOpen()).toBe(true);
    expect(y.isOpen()).toBe(false);
  });

  it('returns the same handle for the same (toolId, tenantId)', () => {
    const a1 = getBreaker('planner.x', TENANT_A);
    const a2 = getBreaker('planner.x', TENANT_A);
    a1.recordFailure('timeout');
    a1.recordFailure('timeout');
    a2.recordFailure('timeout');
    expect(a2.isOpen()).toBe(true);
  });

  it('transitions open → half-open after the configured window', () => {
    const b = getBreaker('planner.x', TENANT_A);
    for (let i = 0; i < 3; i++) b.recordFailure('timeout');
    expect(b.isOpen()).toBe(true);
    vi.advanceTimersByTime(59_999);
    expect(b.isOpen()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(b.isOpen()).toBe(false); // half-open allows a probe
  });

  it('half-open + success → closed (counter cleared)', () => {
    const b = getBreaker('planner.x', TENANT_A);
    for (let i = 0; i < 3; i++) b.recordFailure('timeout');
    vi.advanceTimersByTime(60_000);
    b.recordSuccess();
    // Counter is reset — three new failures needed to re-open.
    b.recordFailure('timeout');
    b.recordFailure('timeout');
    expect(b.isOpen()).toBe(false);
    b.recordFailure('timeout');
    expect(b.isOpen()).toBe(true);
  });

  it('half-open + failure → open again for another full window', () => {
    const b = getBreaker('planner.x', TENANT_A);
    for (let i = 0; i < 3; i++) b.recordFailure('timeout');
    vi.advanceTimersByTime(60_000);
    expect(b.isOpen()).toBe(false); // half-open
    b.recordFailure('timeout');
    expect(b.isOpen()).toBe(true);
    vi.advanceTimersByTime(59_999);
    expect(b.isOpen()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(b.isOpen()).toBe(false);
  });

  it('emits copilot.tool.breaker_opened on the transition to open', () => {
    const events: unknown[] = [];
    setBreakerEventEmitter((e) => {
      events.push(e);
    });
    const b = getBreaker('planner.x', TENANT_A);
    b.recordFailure('timeout');
    b.recordFailure('timeout');
    expect(events).toHaveLength(0);
    b.recordFailure('exception');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      tool_id: 'planner.x',
      tenant_id: TENANT_A,
      failure_count: 3,
      reason: 'exception', // last failure's reason
      opened_at: '2026-05-26T10:00:00.000Z',
    });
  });

  it('does NOT emit on subsequent calls once already open', () => {
    const events: unknown[] = [];
    setBreakerEventEmitter((e) => {
      events.push(e);
    });
    const b = getBreaker('planner.x', TENANT_A);
    for (let i = 0; i < 3; i++) b.recordFailure('timeout');
    b.recordFailure('timeout');
    b.recordFailure('exception');
    expect(events).toHaveLength(1);
  });

  it('emits again when breaker re-opens from half-open', () => {
    const events: unknown[] = [];
    setBreakerEventEmitter((e) => {
      events.push(e);
    });
    const b = getBreaker('planner.x', TENANT_A);
    for (let i = 0; i < 3; i++) b.recordFailure('timeout');
    expect(events).toHaveLength(1);
    vi.advanceTimersByTime(60_000);
    b.recordFailure('timeout');
    expect(events).toHaveLength(2);
  });

  it('setBreakerConfig allows lowering threshold and window', () => {
    setBreakerConfig({ failureThreshold: 1, openMs: 1_000 });
    const b = getBreaker('planner.x', TENANT_A);
    b.recordFailure('timeout');
    expect(b.isOpen()).toBe(true);
    vi.advanceTimersByTime(1_000);
    expect(b.isOpen()).toBe(false);
  });

  it('openUntil reflects current open deadline (zero when closed)', () => {
    const b = getBreaker('planner.x', TENANT_A);
    expect(b.openUntil).toBe(0);
    for (let i = 0; i < 3; i++) b.recordFailure('timeout');
    expect(b.openUntil).toBe(Date.parse('2026-05-26T10:01:00.000Z'));
  });

  it('__resetBreakersForTests wipes state AND config', () => {
    setBreakerConfig({ failureThreshold: 1, openMs: 1 });
    const b = getBreaker('planner.x', TENANT_A);
    b.recordFailure('timeout');
    __resetBreakersForTests();
    const fresh = getBreaker('planner.x', TENANT_A);
    expect(fresh.isOpen()).toBe(false);
    fresh.recordFailure('timeout');
    fresh.recordFailure('timeout');
    expect(fresh.isOpen()).toBe(false); // threshold back to 3
  });
});
