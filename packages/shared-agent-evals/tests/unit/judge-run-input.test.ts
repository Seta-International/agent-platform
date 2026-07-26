import { expect, it } from 'vitest';
import { buildPrebuiltRunInput } from '../../src/judge-scorers.ts';

const answerOf = (r: unknown): string => (r as { answer: string }).answer;

it('forwards grounding context to the prebuilt when forwardContext is true', () => {
  const out = buildPrebuiltRunInput(
    { input: 'q', output: { result: { answer: 'a' } }, groundTruth: 'gt', context: ['ctx'] },
    answerOf,
    { forwardContext: true },
  );
  expect(out).toEqual({ input: 'q', output: 'a', groundTruth: 'gt', context: ['ctx'] });
});

it('omits context when forwardContext is false (relevancy/toxicity)', () => {
  const out = buildPrebuiltRunInput(
    { input: 'q', output: { result: { answer: 'a' } }, context: ['ctx'] },
    answerOf,
    { forwardContext: false },
  );
  expect(out).not.toHaveProperty('context');
  expect(out.output).toBe('a');
});

it('omits context when none is supplied even if forwardContext is true', () => {
  const out = buildPrebuiltRunInput({ input: 'q', output: { result: { answer: 'a' } } }, answerOf, {
    forwardContext: true,
  });
  expect(out).not.toHaveProperty('context');
});
