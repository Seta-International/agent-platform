export { assembleProfile } from './backend/domain/assemble.ts';

export {
  type DataAccessPorts,
  getDataAccess,
  setDataAccess,
} from './backend/domain/data-access.ts';
export { evaluateLayerA, evaluateNormRules } from './backend/domain/norm-engine/index.ts';
export type {
  AllocationData,
  EmployeeProfile,
  NormCategory,
  NormResult,
  NormRuleResult,
  PerformanceData,
  ProfileSnapshot,
  RiskLevel,
  TimesheetData,
  ViolationSummary,
} from './backend/domain/schemas.ts';
export {
  type Audience,
  audienceFromRoles,
  PERFORMANCE_PERMISSIONS,
  type PerformancePermission,
  performanceRbac,
  performanceStatement,
} from './rbac.ts';
