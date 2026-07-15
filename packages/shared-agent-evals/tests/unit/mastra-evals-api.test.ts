import * as prebuilt from '@mastra/evals/scorers/prebuilt';
import { describe, expect, it } from 'vitest';

// Pins the real @mastra/evals surface we build judge-scorer wrappers on. If a
// version bump moves or renames a factory, this test fails loudly here instead
// of deep in a wrapper.
//
// Discovered facts (installed version: @mastra/evals@1.5.1), confirmed by
// reading node_modules/@mastra/evals/dist/scorers/**/*.d.ts:
//
// - Import path `@mastra/evals/scorers/prebuilt` resolves (declared in the
//   package's `exports` map, re-exporting `../llm/index.js` and
//   `../code/index.js`).
// - Judge (LLM-as-judge) factory names, all present as documented:
//     createAnswerRelevancyScorer, createFaithfulnessScorer,
//     createHallucinationScorer, createToxicityScorer.
// - A rubric/custom judge factory also exists: `createRubricScorer`
//   (packages/shared-agent-evals/node_modules/@mastra/evals/dist/scorers/llm/rubric/index.d.ts).
//   It returns a **binary** score (1 only if every required criterion is
//   satisfied) and is designed to plug into `isTaskComplete`.
// - Option shape is flat `{ model, options? }` for the four core factories
//   (NOT `{ judge: { model } }`): e.g.
//     createAnswerRelevancyScorer({ model, options?: { uncertaintyWeight, scale } })
//     createFaithfulnessScorer({ model, options?: { scale, context } })
//     createHallucinationScorer({ model, options?: { scale, context, getContext } })
//     createToxicityScorer({ model, options?: { scale } })
//   `createRubricScorer` takes `{ model, criteria?, options?: { scale } }`.
// - Every factory returns a `MastraScorer` (from `@mastra/core/evals`) whose
//   instance exposes a readonly `id: string` getter and a
//   `run(input): Promise<{ score, reason, ... }>` method — matching the
//   `{ id, run(...) }` shape this test pins.
describe('@mastra/evals prebuilt scorer surface', () => {
  it('exposes the judge scorer factories we depend on', () => {
    expect(typeof prebuilt.createAnswerRelevancyScorer).toBe('function');
    expect(typeof prebuilt.createFaithfulnessScorer).toBe('function');
    expect(typeof prebuilt.createHallucinationScorer).toBe('function');
    expect(typeof prebuilt.createToxicityScorer).toBe('function');
  });

  it('exposes a rubric/custom judge scorer factory', () => {
    expect(typeof prebuilt.createRubricScorer).toBe('function');
  });

  it('factory output has the { id, run(...) } shape scorers.ts wrappers rely on', () => {
    const scorer = prebuilt.createToxicityScorer({ model: 'openai/gpt-4o-mini' });
    expect(typeof scorer.id).toBe('string');
    expect(typeof scorer.run).toBe('function');
  });
});
