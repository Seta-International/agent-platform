import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EvaluationError } from '../../src/backend/rbac.ts';
import { resolveModel, validateModelSpec } from '../../src/backend/scoring/resolve-model.ts';

describe('resolveModel', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.SELFHOST_BASE_URL;
    delete process.env.SELFHOST_API_KEY;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('passes a cloud provider/model string straight through', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(resolveModel('openai/gpt-4o')).toBe('openai/gpt-4o');
  });

  it('returns a config object for a self-hosted base URL', () => {
    process.env.SELFHOST_BASE_URL = 'http://localhost:11434/v1';
    process.env.SELFHOST_API_KEY = 'x';
    const m = resolveModel('selfhost/llama3') as { id: string; url: string };
    expect(m.id).toBe('selfhost/llama3');
    expect(m.url).toBe('http://localhost:11434/v1');
  });

  it('returns a mock model for mock/*', () => {
    const m = resolveModel('mock/test');
    expect(m).toBeDefined();
    expect(typeof m).not.toBe('string');
  });

  it('validateModelSpec throws when no credentials are present', () => {
    expect(() => validateModelSpec('openai/gpt-4o')).toThrow(EvaluationError);
  });

  it('validateModelSpec passes for mock and for a provider with a key', () => {
    expect(() => validateModelSpec('mock/test')).not.toThrow();
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(() => validateModelSpec('openai/gpt-4o')).not.toThrow();
  });
});
