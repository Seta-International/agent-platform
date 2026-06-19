// Engine types are derived from the module's zod schemas so tool I/O and the
// engine never drift apart. Re-exported here as the engine's public type surface.
export type {
  NormCategory,
  NormResult,
  NormRuleResult,
  ProfileSnapshot,
  RiskLevel,
} from '../schemas.ts';
