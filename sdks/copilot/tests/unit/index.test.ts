import { describe, expect, it } from 'vitest';
import * as sdk from '../../src/index';

describe('sdk index re-exports', () => {
  it('exports registry primitives', () => {
    expect(typeof sdk.CopilotRegistry).toBe('object');
    expect(typeof sdk.CopilotRegistry.registerSpecialist).toBe('function');
    expect(typeof sdk.CopilotRegistry.freeze).toBe('function');
  });
});
