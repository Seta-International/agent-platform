import { afterEach, describe, expect, it } from 'vitest';
import { DuplicateOrchestrationError, OrchestrationRegistry } from '../../src/registry.ts';
import type { OrchestrationSpec } from '../../src/types.ts';

const spec = (id: string): OrchestrationSpec => ({
  id,
  steps: [],
  serializationKey: () => 'k',
  onComplete: async () => {},
});

afterEach(() => OrchestrationRegistry.__resetForTests());

describe('OrchestrationRegistry', () => {
  it('registers and gets by id', () => {
    OrchestrationRegistry.register(spec('o1'));
    expect(OrchestrationRegistry.get('o1')?.id).toBe('o1');
  });

  it('throws on duplicate id', () => {
    OrchestrationRegistry.register(spec('o1'));
    expect(() => OrchestrationRegistry.register(spec('o1'))).toThrow(DuplicateOrchestrationError);
  });

  it('get returns undefined for unknown id', () => {
    expect(OrchestrationRegistry.get('nope')).toBeUndefined();
  });
});
