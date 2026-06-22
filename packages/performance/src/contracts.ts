// Public contracts for @seta/performance.
// Re-export domain types that cross-module callers may reference.

export type {
  AccessDeniedCard,
  AccountSummaryCard,
  AtRiskListCard,
  CardMetric,
  CardPayload,
  CardRiskLevel,
  CardType,
  EmployeeProfileCard,
  HumanReviewFlagCard,
  InlineTranscriptCard,
} from './backend/cards/schema.ts';

// The card contract — the structured payload the ARIA agent returns via the
// performance_renderCard tool. The frontend ingests this shape (switching on
// `card.type`) to render agent response cards. The Zod schema is exported too
// for callers that want to validate a payload at the boundary.
export {
  CARD_TYPES,
  CardPayloadSchema,
  CardRiskLevelSchema,
} from './backend/cards/schema.ts';
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
