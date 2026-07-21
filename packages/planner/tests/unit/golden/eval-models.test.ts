import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  DEFAULT_JUDGE_MODEL,
  resolveEvalGenModel,
  resolveEvalJudgeModel,
} from '../../fixtures/golden/eval-models.ts';

const saved = process.env.EVAL_JUDGE_MODEL;
beforeEach(() => {
  delete process.env.EVAL_JUDGE_MODEL;
});
afterEach(() => {
  if (saved === undefined) delete process.env.EVAL_JUDGE_MODEL;
  else process.env.EVAL_JUDGE_MODEL = saved;
});

it('judge model defaults to openai/gpt-4o when EVAL_JUDGE_MODEL is unset', () => {
  const { key } = resolveEvalJudgeModel();
  expect(key).toBe(DEFAULT_JUDGE_MODEL);
  expect(DEFAULT_JUDGE_MODEL.startsWith('openai/')).toBe(true);
});

it('judge model honors the EVAL_JUDGE_MODEL env var', () => {
  process.env.EVAL_JUDGE_MODEL = 'openai/gpt-4.1';
  expect(resolveEvalJudgeModel().key).toBe('openai/gpt-4.1');
});

it('gen model resolves from the agent registry (env default) and carries a key', () => {
  const { key, model } = resolveEvalGenModel();
  expect(typeof key).toBe('string');
  expect(key.length).toBeGreaterThan(0);
  expect(model).toBeDefined();
});
