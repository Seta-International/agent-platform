import { describe, expect, it } from 'vitest';
import { resolveReranker } from '../src/resolver.ts';

describe('resolveReranker', () => {
  it('returns NoopReranker when RERANKER_PROVIDER=none', () => {
    const r = resolveReranker({ env: { RERANKER_PROVIDER: 'none' } });
    expect(r.providerId).toBe('noop');
  });

  it('returns CohereReranker when RERANKER_PROVIDER=cohere and key present', () => {
    const r = resolveReranker({ env: { RERANKER_PROVIDER: 'cohere', COHERE_API_KEY: 'k' } });
    expect(r.providerId).toBe('cohere');
  });

  it('returns LlmJudgeReranker when RERANKER_PROVIDER=llm-judge', () => {
    const r = resolveReranker({ env: { RERANKER_PROVIDER: 'llm-judge' } });
    expect(r.providerId).toBe('llm-judge');
  });

  it('auto: picks Cohere when COHERE_API_KEY is set, otherwise LlmJudge', () => {
    expect(resolveReranker({ env: { COHERE_API_KEY: 'k' } }).providerId).toBe('cohere');
    expect(resolveReranker({ env: {} }).providerId).toBe('llm-judge');
  });

  it('throws when RERANKER_PROVIDER=cohere but no COHERE_API_KEY', () => {
    expect(() => resolveReranker({ env: { RERANKER_PROVIDER: 'cohere' } })).toThrow(
      /COHERE_API_KEY/,
    );
  });
});
