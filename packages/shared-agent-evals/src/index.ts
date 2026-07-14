export const EVALS_HARNESS_VERSION = 'phase-1';

export {
  defineEvalCase,
  defineEvalSuite,
  type EvalActor,
  type EvalCase,
  type EvalManifest,
  type EvalSuite,
} from './dataset.ts';

export {
  goldenMatchScorer,
  schemaConformanceScorer,
  trustEnvelopeScorer,
} from './scorers.ts';
