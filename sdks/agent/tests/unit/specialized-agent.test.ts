import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  DuplicateSpecializedAgentError,
  SpecializedAgentFrozenError,
  SpecializedAgentNotFrozenError,
  SpecializedAgentRegistry,
  type SpecializedAgentSpec,
} from '../../src/specialized-agent.ts';
import { EMPTY_TRUST } from '../../src/trust.ts';

const makeAgent = (id: string): SpecializedAgentSpec<{ x: number }, { y: number }> => ({
  id,
  description: `agent ${id}`,
  inputSchema: z.object({ x: z.number() }),
  outputSchema: z.object({ y: z.number() }),
  run: async (input) => ({ result: { y: input.x + 1 }, trust: EMPTY_TRUST }),
});

afterEach(() => SpecializedAgentRegistry.__resetForTests());

describe('SpecializedAgentRegistry', () => {
  it('registers and retrieves an agent by id', () => {
    SpecializedAgentRegistry.register(makeAgent('a'));
    expect(SpecializedAgentRegistry.get('a')?.id).toBe('a');
  });

  it('throws on duplicate id', () => {
    SpecializedAgentRegistry.register(makeAgent('a'));
    expect(() => SpecializedAgentRegistry.register(makeAgent('a'))).toThrow(
      DuplicateSpecializedAgentError,
    );
  });

  it('throws when registering after freeze', () => {
    SpecializedAgentRegistry.freeze();
    expect(() => SpecializedAgentRegistry.register(makeAgent('a'))).toThrow(
      SpecializedAgentFrozenError,
    );
  });

  it('throws when snapshotting before freeze', () => {
    SpecializedAgentRegistry.register(makeAgent('a'));
    expect(() => SpecializedAgentRegistry.snapshot()).toThrow(SpecializedAgentNotFrozenError);
  });

  it('snapshot returns all agents after freeze', () => {
    SpecializedAgentRegistry.register(makeAgent('a'));
    SpecializedAgentRegistry.register(makeAgent('b'));
    SpecializedAgentRegistry.freeze();
    expect(
      SpecializedAgentRegistry.snapshot()
        .map((s) => s.id)
        .sort(),
    ).toEqual(['a', 'b']);
  });

  it('get returns undefined for unknown id', () => {
    expect(SpecializedAgentRegistry.get('nope')).toBeUndefined();
  });
});
