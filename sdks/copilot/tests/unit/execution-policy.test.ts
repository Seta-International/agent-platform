import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetExecutionPolicyForTests,
  resolveTimeoutMs,
  setExecutionPolicy,
} from '../../src/execution-policy';

describe('execution-policy', () => {
  afterEach(() => __resetExecutionPolicyForTests());

  it('returns read default (30s) for a tool without needsApproval', () => {
    expect(resolveTimeoutMs({})).toBe(30_000);
    expect(resolveTimeoutMs({ needsApproval: false })).toBe(30_000);
  });

  it('returns write default (60s) when needsApproval is true (boolean)', () => {
    expect(resolveTimeoutMs({ needsApproval: true })).toBe(60_000);
  });

  it('treats a function-form needsApproval (per-call predicate) as a write tool', () => {
    const predicate = async () => true;
    expect(resolveTimeoutMs({ needsApproval: predicate })).toBe(60_000);
  });

  it('honours an explicit per-tool override above the write default', () => {
    expect(resolveTimeoutMs({ needsApproval: true, executionTimeoutMs: 120_000 })).toBe(120_000);
  });

  it('honours an explicit per-tool override below the read default', () => {
    expect(resolveTimeoutMs({ executionTimeoutMs: 5_000 })).toBe(5_000);
  });

  it('caps an override at the configured max (default 300_000)', () => {
    expect(resolveTimeoutMs({ executionTimeoutMs: 10_000_000 })).toBe(300_000);
  });

  it('setExecutionPolicy applies partial overrides (read only)', () => {
    setExecutionPolicy({ readMs: 10_000 });
    expect(resolveTimeoutMs({})).toBe(10_000);
    expect(resolveTimeoutMs({ needsApproval: true })).toBe(60_000);
  });

  it('setExecutionPolicy applies all three fields', () => {
    setExecutionPolicy({ readMs: 5_000, writeMs: 15_000, maxMs: 20_000 });
    expect(resolveTimeoutMs({})).toBe(5_000);
    expect(resolveTimeoutMs({ needsApproval: true })).toBe(15_000);
    expect(resolveTimeoutMs({ executionTimeoutMs: 100_000 })).toBe(20_000);
  });

  it('__resetExecutionPolicyForTests restores defaults', () => {
    setExecutionPolicy({ readMs: 1, writeMs: 2, maxMs: 3 });
    __resetExecutionPolicyForTests();
    expect(resolveTimeoutMs({})).toBe(30_000);
    expect(resolveTimeoutMs({ needsApproval: true })).toBe(60_000);
  });
});
