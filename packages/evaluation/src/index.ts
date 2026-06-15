// Public surface for @seta/evaluation. Domain functions are added in Plans 02–04.

export {
  EVALUATION_RUN_COMPLETED,
  EVALUATION_RUN_CREATED,
  EVALUATION_RUN_FAILED,
} from './events.ts';
export { EVALUATION_PERMISSIONS, type EvaluationPermission } from './rbac.ts';
