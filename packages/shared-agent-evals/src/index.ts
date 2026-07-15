export const EVALS_HARNESS_VERSION = 'phase-1';

export {
  defineEvalCase,
  defineEvalSuite,
  type EvalActor,
  type EvalCase,
  type EvalManifest,
  type EvalSuite,
} from './dataset.ts';
export { fakeJudgeModel, type JudgeConfig, type JudgeModel } from './judge.ts';
export {
  type CaseScore,
  type RunSpecEvalsConfig,
  type RunSpecEvalsResult,
  runSpecEvals,
  type SpecScorerEntry,
} from './run-spec-evals.ts';
export {
  goldenMatchScorer,
  schemaConformanceScorer,
  trustEnvelopeScorer,
} from './scorers.ts';
