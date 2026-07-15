import { describe, expect, it } from 'vitest';
import { EVALS_HARNESS_VERSION } from '../../src/index.ts';

describe('@seta/shared-agent-evals', () => {
  it('exposes a package anchor', () => {
    expect(EVALS_HARNESS_VERSION).toBe('phase-2a');
  });
});
