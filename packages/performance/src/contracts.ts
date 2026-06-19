// Public contracts for @seta/performance.
// Re-export domain types that cross-module callers may reference.
export type {
  AllocationData,
  EmployeeProfile,
  NormResult,
  PerformanceData,
  ProfileSnapshot,
  RiskLevel,
  TimesheetData,
  ViolationSummary,
} from './backend/domain/schemas.ts';
