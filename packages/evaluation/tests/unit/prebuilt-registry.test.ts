import { describe, expect, it } from 'vitest';
import {
  listScorerCatalogue,
  SCORER_REGISTRY,
} from '../../src/backend/scoring/prebuilt-registry.ts';

describe('SCORER_REGISTRY', () => {
  it('registers the Phase-1 raw-call-compatible scorers', () => {
    expect(Object.keys(SCORER_REGISTRY).sort()).toEqual(
      ['answer-relevancy', 'completeness', 'toxicity'].sort(),
    );
  });

  it('classifies kinds correctly (completeness is code, others are llm-judge)', () => {
    expect(SCORER_REGISTRY['completeness']?.kind).toBe('code');
    expect(SCORER_REGISTRY['answer-relevancy']?.kind).toBe('llm-judge');
    expect(SCORER_REGISTRY['toxicity']?.kind).toBe('llm-judge');
  });

  it('declares required input fields per scorer', () => {
    expect(SCORER_REGISTRY['toxicity']?.requires).toEqual(['output']);
    expect(SCORER_REGISTRY['answer-relevancy']?.requires).toEqual(['input', 'output']);
    expect(SCORER_REGISTRY['completeness']?.requires).toEqual(['input', 'output']);
  });

  it('builds a code scorer with no judge model', () => {
    const scorer = SCORER_REGISTRY['completeness']?.build({});
    expect(scorer).toBeDefined();
    expect(typeof scorer?.run).toBe('function');
  });

  it('listScorerCatalogue returns id/kind/requires triples', () => {
    const cat = listScorerCatalogue();
    expect(cat.find((s) => s.id === 'toxicity')).toEqual({
      id: 'toxicity',
      kind: 'llm-judge',
      requires: ['output'],
    });
  });
});
