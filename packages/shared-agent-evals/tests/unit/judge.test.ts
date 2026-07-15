import { describe, expect, it } from 'vitest';
import { fakeJudgeModel } from '../../src/judge.ts';

describe('fakeJudgeModel', () => {
  it('produces a usable MastraModelConfig with no API key', () => {
    const model = fakeJudgeModel([0.5]);
    expect(model).toBeDefined();
    // A Mastra model config is either a model instance or a resolvable spec;
    // assert it is a non-null object we can hand to a scorer.
    expect(typeof model).not.toBe('string');
    expect(model).not.toBeNull();
  });
});
