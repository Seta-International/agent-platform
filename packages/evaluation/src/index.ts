// Public surface for @seta/evaluation.

export { type AddCasesInput, addCases } from './backend/domain/add-cases.ts';
export { type CreateDatasetInput, createDataset } from './backend/domain/create-dataset.ts';
export { listDatasets } from './backend/domain/list-datasets.ts';
export { listScorers, type ScorerInfo } from './backend/domain/list-scorers.ts';
export {
  EVALUATION_RUN_COMPLETED,
  EVALUATION_RUN_CREATED,
  EVALUATION_RUN_FAILED,
} from './events.ts';
export { EVALUATION_PERMISSIONS, type EvaluationPermission } from './rbac.ts';
