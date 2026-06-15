import type { MastraModelConfig } from '@mastra/core/llm';
import {
  createAnswerRelevancyScorer,
  createCompletenessScorer,
  createToxicityScorer,
} from '@mastra/evals/scorers/prebuilt';

export type ScorerKind = 'code' | 'llm-judge';
export type ScorerField = 'input' | 'output' | 'groundTruth';

// Minimal structural type — a built scorer must expose run(). Avoids depending on
// Mastra's exact MastraScorer generic surface here.
export interface BuiltScorer {
  run: (input: unknown) => Promise<{ score: number; reason?: string }>;
}

export interface ScorerDef {
  id: string;
  kind: ScorerKind;
  requires: ScorerField[];
  build: (opts: { judgeModel?: MastraModelConfig }) => BuiltScorer;
}

/**
 * Phase-1 scorers — restricted to those a RAW LLM call can feed.
 * Excluded deliberately: faithfulness / hallucination / context-* (RAG scorers
 * that need a retrieval context a bare prompt does not produce). See spec §4.3.
 */
export const SCORER_REGISTRY: Record<string, ScorerDef> = {
  'answer-relevancy': {
    id: 'answer-relevancy',
    kind: 'llm-judge',
    requires: ['input', 'output'],
    build: ({ judgeModel }) =>
      createAnswerRelevancyScorer({
        model: judgeModel as MastraModelConfig,
      }) as unknown as BuiltScorer,
  },
  toxicity: {
    id: 'toxicity',
    kind: 'llm-judge',
    requires: ['output'],
    build: ({ judgeModel }) =>
      createToxicityScorer({ model: judgeModel as MastraModelConfig }) as unknown as BuiltScorer,
  },
  completeness: {
    id: 'completeness',
    kind: 'code',
    requires: ['input', 'output'],
    build: () => createCompletenessScorer() as unknown as BuiltScorer,
  },
};

export function listScorerCatalogue(): Array<Pick<ScorerDef, 'id' | 'kind' | 'requires'>> {
  return Object.values(SCORER_REGISTRY).map(({ id, kind, requires }) => ({ id, kind, requires }));
}

export function isKnownScorer(id: string): boolean {
  return id in SCORER_REGISTRY;
}
