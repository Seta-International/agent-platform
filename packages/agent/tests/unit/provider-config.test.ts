import { describe, expect, it } from 'vitest';
import {
  parseModelEntry,
  providerEnvVars,
  validateModelEnv,
} from '../../src/backend/provider-config.ts';

describe('parseModelEntry', () => {
  it('parses provider/model with default tier balanced', () => {
    const e = parseModelEntry('openai/gpt-5.5', {});
    expect(e).toMatchObject({ key: 'openai/gpt-5.5', providerId: 'openai', tier: 'balanced' });
    expect(e.model).toBe('openai/gpt-5.5');
  });

  it('parses explicit tier suffix and strips it from the model string', () => {
    const e = parseModelEntry('anthropic/claude-x:reasoning', {});
    expect(e).toMatchObject({
      providerId: 'anthropic',
      tier: 'reasoning',
      key: 'anthropic/claude-x',
    });
    expect(e.model).toBe('anthropic/claude-x');
  });

  it('builds a custom-provider config object when <PROVIDER>_BASE_URL is set', () => {
    const e = parseModelEntry('vllm/llama-3.3', {
      VLLM_BASE_URL: 'http://host:1234/v1',
      VLLM_API_KEY: 'k',
    });
    expect(e.model).toEqual({
      providerId: 'vllm',
      modelId: 'llama-3.3',
      url: 'http://host:1234/v1',
      apiKey: 'k',
    });
  });

  it('keeps model ids that contain slashes intact', () => {
    const e = parseModelEntry('openrouter/meta/llama-3:fast', {});
    expect(e).toMatchObject({ providerId: 'openrouter', tier: 'fast' });
    expect(e.model).toBe('openrouter/meta/llama-3');
  });

  it('throws on a bare model with no provider', () => {
    expect(() => parseModelEntry('gpt-5.5', {})).toThrow(/provider\/model/);
  });

  it('throws on an unknown tier suffix only when it matches the tier slot', () => {
    // ':latest' is not a known tier, so it stays part of the model id
    const e = parseModelEntry('openai/gpt-5.5:latest', {});
    expect(e.tier).toBe('balanced');
    expect(e.model).toBe('openai/gpt-5.5:latest');
  });
});

describe('providerEnvVars', () => {
  it('maps known cloud providers to their conventional key var', () => {
    expect(providerEnvVars('openai')).toEqual({
      apiKey: 'OPENAI_API_KEY',
      baseUrl: 'OPENAI_BASE_URL',
    });
    expect(providerEnvVars('anthropic').apiKey).toBe('ANTHROPIC_API_KEY');
  });

  it('derives convention vars for unknown providers', () => {
    expect(providerEnvVars('my-vllm')).toEqual({
      apiKey: 'MY_VLLM_API_KEY',
      baseUrl: 'MY_VLLM_BASE_URL',
    });
  });
});

describe('validateModelEnv', () => {
  it('passes when the default provider key is present', () => {
    expect(() =>
      validateModelEnv({
        AGENT_MODELS: 'openai/gpt-5.5',
        EMBED_MODEL: 'openai/text-embedding-3-small',
        OPENAI_API_KEY: 'k',
      }),
    ).not.toThrow();
  });

  it('throws listing every missing key', () => {
    expect(() =>
      validateModelEnv({
        AGENT_MODELS: 'openai/gpt-5.5,anthropic/claude-x',
        EMBED_MODEL: 'openai/text-embedding-3-small',
      }),
    ).toThrow(/OPENAI_API_KEY.*ANTHROPIC_API_KEY|ANTHROPIC_API_KEY.*OPENAI_API_KEY/);
  });

  it('accepts a self-host provider with only BASE_URL set (key optional)', () => {
    expect(() =>
      validateModelEnv({
        AGENT_MODELS: 'lmstudio/qwen',
        EMBED_MODEL: 'openai/text-embedding-3-small',
        LMSTUDIO_BASE_URL: 'http://x/v1',
        OPENAI_API_KEY: 'k',
      }),
    ).not.toThrow();
  });

  it('exempts the mock provider', () => {
    expect(() =>
      validateModelEnv({
        AGENT_MODELS: 'mock/echo',
        EMBED_MODEL: 'openai/text-embedding-3-small',
        OPENAI_API_KEY: 'k',
      }),
    ).not.toThrow();
  });

  it('validateModelEnv passes for the mock test profile', () => {
    expect(() =>
      validateModelEnv({
        AGENT_MODELS: 'mock/echo',
        EMBED_MODEL: 'openai/text-embedding-3-small',
        OPENAI_API_KEY: 'k',
      }),
    ).not.toThrow();
  });
});
