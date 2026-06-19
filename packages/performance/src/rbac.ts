import { type Statement, toManifest } from '@seta/shared-rbac';

/**
 * Permission surface for the performance (ARIA) module.
 *
 * Sensitive fields (promotion readiness, salary band) are gated by their own
 * permission and stripped at the data-retrieval tool boundary — before any
 * value reaches the LLM context. See `audienceFromRoles` + the redaction in
 * `get-employee-profile.ts`.
 *
 * TODO(rbac): Add these permissions to packages/shared-rbac/src/inventory.ts and
 * run `pnpm gen:rbac`. See packages/knowledge/src/rbac.ts for the full example.
 */
export const performanceStatement = {
  'performance.employee': ['read'],
  'performance.violation': ['read'],
  'performance.norm': ['read'],
  'performance.report': ['generate'],
  'performance.aggregate': ['read'],
  'performance.promotion_readiness': ['read'],
  'performance.salary_band': ['read'],
} as const satisfies Statement;

const roleStatements = {
  // HR — full access, including the two sensitive fields.
  'performance.hr': {
    'performance.employee': ['read'],
    'performance.violation': ['read'],
    'performance.norm': ['read'],
    'performance.report': ['generate'],
    'performance.aggregate': ['read'],
    'performance.promotion_readiness': ['read'],
    'performance.salary_band': ['read'],
  },
  // Leader — full profile + report generation, but no promotion/salary fields.
  'performance.leader': {
    'performance.employee': ['read'],
    'performance.violation': ['read'],
    'performance.norm': ['read'],
    'performance.report': ['generate'],
    'performance.aggregate': ['read'],
  },
  // BOD — aggregate/workforce views; individual reads allowed only on drill-down.
  'performance.bod': {
    'performance.employee': ['read'],
    'performance.violation': ['read'],
    'performance.norm': ['read'],
    'performance.aggregate': ['read'],
  },
} as const satisfies Record<string, Statement>;

export const performanceRbac = toManifest('performance', performanceStatement, roleStatements, {
  'performance.hr': 'HR — full performance access including promotion readiness and salary band',
  'performance.leader': 'Leader — full profile and report generation for their org',
  'performance.bod': 'BOD — aggregate workforce views and read-only drill-down',
});

export type PerformancePermission = (typeof performanceRbac.permissions)[number]['key'];

export const PERFORMANCE_PERMISSIONS = performanceRbac.permissions.map((p) => p.key);

/** Audience tier the agent tailors output depth and redaction to. */
export type Audience = 'hr' | 'leader' | 'bod';

/**
 * Maps the session's roles to an audience tier. Defaults to the least-privileged
 * tier (`bod`) when no performance role is present, so redaction fails safe.
 */
export function audienceFromRoles(roles: readonly string[]): Audience {
  if (roles.includes('performance.hr')) return 'hr';
  if (roles.includes('performance.leader')) return 'leader';
  return 'bod';
}
