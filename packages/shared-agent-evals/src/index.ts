export const EVALS_HARNESS_VERSION = 'phase-1';

export {
  type DatasetItemToolMock,
  defineEvalCase,
  defineEvalSuite,
  type EvalActor,
  type EvalCase,
  type EvalManifest,
  type EvalSuite,
} from './dataset.ts';
export { fakeJudgeModel, type JudgeConfig, type JudgeModel } from './judge.ts';
export {
  answerRelevancyScorer,
  faithfulnessScorer,
  hallucinationScorer,
  toxicityScorer,
} from './judge-scorers.ts';
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
export { buildMockTools } from './tool-mock.ts';
