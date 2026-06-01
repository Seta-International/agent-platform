import { MockLanguageModelV3 } from 'ai/test';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function freshRegistry(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  return import('../../src/backend/model-registry.ts');
}

afterEach(() => {
  delete process.env.AGENT_MODELS;
  delete process.env.AGENT_MODEL_DEFAULT;
});

describe('model-registry', () => {
  it('lists models parsed from AGENT_MODELS with tier metadata', async () => {
    const { listModels } = await freshRegistry({
      AGENT_MODELS: 'openai/gpt-5.5:balanced,openai/o4-mini:reasoning',
    });
    const { models, default: def } = listModels();
    expect(def).toBe('auto');
    expect(models.map((m) => m.key)).toEqual(['openai/gpt-5.5', 'openai/o4-mini']);
    expect(models[1]?.tier).toBe('reasoning');
  });

  it('defaults to a single openai entry when AGENT_MODELS is unset', async () => {
    const { listModels } = await freshRegistry({});
    expect(listModels().models).toHaveLength(1);
    expect(listModels().models[0]?.providerId).toBe('openai');
  });

  it('resolveModel("auto") with reasoning hint picks the reasoning tier', async () => {
    const { resolveModel } = await freshRegistry({
      AGENT_MODELS: 'openai/gpt-5.4-mini:fast,openai/o4-mini:reasoning',
    });
    const { entry } = resolveModel('auto', { tierHint: 'reasoning' });
    expect(entry.tier).toBe('reasoning');
  });

  it('resolveModel returns the router string as the model (no AI SDK object)', async () => {
    const { resolveModel } = await freshRegistry({ AGENT_MODELS: 'openai/gpt-5.5' });
    expect(resolveModel('openai/gpt-5.5').model).toBe('openai/gpt-5.5');
  });

  it('resolves mock/* to a MockLanguageModelV3 instance', async () => {
    const { resolveModel } = await freshRegistry({ AGENT_MODELS: 'mock/echo' });
    expect(resolveModel('mock/echo').model).toBeInstanceOf(MockLanguageModelV3);
  });

  it('throws ModelNotFoundError for an unknown key', async () => {
    const { resolveModel, ModelNotFoundError } = await freshRegistry({
      AGENT_MODELS: 'openai/gpt-5.5',
    });
    expect(() => resolveModel('openai/nope')).toThrow(ModelNotFoundError);
  });
});
