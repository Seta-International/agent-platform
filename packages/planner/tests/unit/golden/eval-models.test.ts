import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  DEFAULT_JUDGE_MODEL,
  resolveEvalGenModel,
  resolveEvalJudgeModel,
} from '../../fixtures/golden/eval-models.ts';

const savedEnv = {
  EVAL_JUDGE_MODEL: process.env.EVAL_JUDGE_MODEL,
  EVAL_GEN_MODEL: process.env.EVAL_GEN_MODEL,
  AGENT_MODEL_DEFAULT: process.env.AGENT_MODEL_DEFAULT,
  LLAMACPP_BASE_URL: process.env.LLAMACPP_BASE_URL,
  LLAMACPP_API_KEY: process.env.LLAMACPP_API_KEY,
};
beforeEach(() => {
  for (const k of Object.keys(savedEnv)) delete process.env[k];
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
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

it('gen model: cloud provider (no base URL) resolves to the bare provider/model string', () => {
  process.env.EVAL_GEN_MODEL = 'openai/gpt-4.1';
  const { key, model } = resolveEvalGenModel();
  expect(key).toBe('openai/gpt-4.1');
  expect(model).toBe('openai/gpt-4.1');
});

it('gen model: self-hosted provider (base URL set) carries an explicit url + apiKey config', () => {
  process.env.EVAL_GEN_MODEL = 'llamacpp/qwen3.5-27b';
  process.env.LLAMACPP_BASE_URL = 'http://localhost:8080/v1';
  process.env.LLAMACPP_API_KEY = 'sk-local';
  const { key, model } = resolveEvalGenModel();
  expect(key).toBe('llamacpp/qwen3.5-27b');
  expect(model).toEqual({
    providerId: 'llamacpp',
    modelId: 'qwen3.5-27b',
    url: 'http://localhost:8080/v1',
    apiKey: 'sk-local',
  });
});

it('gen model: falls back to AGENT_MODEL_DEFAULT when EVAL_GEN_MODEL is unset', () => {
  process.env.AGENT_MODEL_DEFAULT = 'openai/gpt-4o';
  expect(resolveEvalGenModel().key).toBe('openai/gpt-4o');
});

it('gen model: throws on an unresolvable value (unset / auto / no provider slash)', () => {
  expect(() => resolveEvalGenModel()).toThrow(/EVAL_GEN_MODEL/);
  process.env.AGENT_MODEL_DEFAULT = 'auto';
  expect(() => resolveEvalGenModel()).toThrow(/EVAL_GEN_MODEL/);
});
