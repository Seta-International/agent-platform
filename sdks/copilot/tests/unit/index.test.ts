import { describe, expect, it } from 'vitest';
import * as sdk from '../../src/index';

describe('sdk index re-exports', () => {
  it('exports registry primitives', () => {
    expect(typeof sdk.CopilotRegistry).toBe('object');
    expect(typeof sdk.CopilotRegistry.registerSpecialist).toBe('function');
    expect(typeof sdk.CopilotRegistry.freeze).toBe('function');
  });
});

describe('barrel exports for tool-execution timeout', () => {
  it('re-exports the new error classes', () => {
    expect(sdk.ToolExecutionTimeoutError).toBeDefined();
    expect(sdk.ToolBreakerOpenError).toBeDefined();
  });
  it('re-exports the engine-side configuration setters', () => {
    expect(typeof sdk.setExecutionPolicy).toBe('function');
    expect(typeof sdk.setBreakerConfig).toBe('function');
    expect(typeof sdk.setBreakerEventEmitter).toBe('function');
  });
  it('re-exports the test-only reset helpers (needed by downstream integration tests)', () => {
    expect(typeof sdk.__resetExecutionPolicyForTests).toBe('function');
    expect(typeof sdk.__resetBreakersForTests).toBe('function');
    expect(typeof sdk.__resetBreakerEmitterForTests).toBe('function');
  });
});
