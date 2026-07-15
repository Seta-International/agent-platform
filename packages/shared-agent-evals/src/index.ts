export const EVALS_HARNESS_VERSION = 'phase-2a';

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
  type QualityCaseScore,
  type QualityScorerEntry,
  type RunQualityEvalsConfig,
  type RunQualityEvalsResult,
  runQualityEvals,
} from './run-quality-evals.ts';
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
export { buildMockTools, requireMockTool } from './tool-mock.ts';
