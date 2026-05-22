import { CohereReranker } from './cohere.ts';
import { LlmJudgeReranker } from './llm-judge.ts';
import { NoopReranker } from './noop.ts';
import type { Reranker } from './reranker.ts';

export interface ResolveRerankerOptions {
  env?: Record<string, string | undefined>;
}

export function resolveReranker(opts: ResolveRerankerOptions = {}): Reranker {
  const env = opts.env ?? process.env;
  const choice = env.RERANKER_PROVIDER ?? 'auto';

  switch (choice) {
    case 'none':
      return new NoopReranker();
    case 'cohere':
      if (!env.COHERE_API_KEY) throw new Error('RERANKER_PROVIDER=cohere requires COHERE_API_KEY');
      return new CohereReranker({ apiKey: env.COHERE_API_KEY });
    case 'llm-judge':
      return new LlmJudgeReranker();
    default:
      return env.COHERE_API_KEY
        ? new CohereReranker({ apiKey: env.COHERE_API_KEY })
        : new LlmJudgeReranker();
  }
}
