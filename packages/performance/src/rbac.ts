import { type Statement, toManifest } from '@seta/shared-rbac';

/**
 * Permission surface for the performance module (ARIA agent + dashboards).
 *
 * This manifest is kept in lockstep with the `performance` slice of
 * `packages/shared-rbac/src/inventory.ts` (the runtime resolver's source of
 * truth) — the rbac-parity test asserts they are identical. After editing
 * either, run `pnpm gen:rbac`.
 *
 * Sensitive fields (promotion readiness, salary band) are gated by their own
 * permission AND stripped at the data-retrieval tool boundary for non-HR
 * audiences — before any value reaches the LLM context. See `audienceFromRoles`
 * + the redaction in `get-employee-profile.ts`.
 */
export const performanceStatement = {
  'performance.dashboard': ['read', 'team.read', 'executive.read'],
  'performance.employee': ['read'],
  'performance.violation': ['read'],
  'performance.norm': ['read'],
  'performance.report': ['generate'],
  'performance.aggregate': ['read'],
  'performance.promotion_readiness': ['read'],
  'performance.salary_band': ['read'],
} as const satisfies Statement;

const roleStatements = {
  // Employee — own performance dashboard only; no ARIA agent access.
  'performance.employee': {
    'performance.dashboard': ['read'],
  },
  // Manager — team dashboards + ARIA at Leader depth (full profile + reports,
  // but no promotion readiness or salary band). Maps to the 'leader' audience.
  'performance.manager': {
    'performance.dashboard': ['read', 'team.read'],
    'performance.employee': ['read'],
    'performance.violation': ['read'],
    'performance.norm': ['read'],
    'performance.report': ['generate'],
    'performance.aggregate': ['read'],
  },
  // BOD — all dashboards + aggregate/workforce ARIA views. Individual reads are
  // allowed only on explicit drill-down (enforced in the card builders).
  'performance.bod': {
    'performance.dashboard': ['read', 'team.read', 'executive.read'],
    'performance.employee': ['read'],
    'performance.violation': ['read'],
    'performance.norm': ['read'],
    'performance.aggregate': ['read'],
  },
  // HR — full access, including the two sensitive fields.
  'performance.hr': {
    'performance.dashboard': ['read', 'team.read', 'executive.read'],
    'performance.employee': ['read'],
    'performance.violation': ['read'],
    'performance.norm': ['read'],
    'performance.report': ['generate'],
    'performance.aggregate': ['read'],
    'performance.promotion_readiness': ['read'],
    'performance.salary_band': ['read'],
  },
} as const satisfies Record<string, Statement>;

export const performanceRbac = toManifest('performance', performanceStatement, roleStatements, {
  'performance.employee': 'View own performance dashboard',
  'performance.manager': 'View team dashboards and use ARIA performance insights for their team',
  'performance.bod': 'View all dashboards and workforce-level ARIA insights',
  'performance.hr': 'Full performance access including ARIA HR-sensitive fields',
});

export type PerformancePermission = (typeof performanceRbac.permissions)[number]['key'];

export const PERFORMANCE_PERMISSIONS = performanceRbac.permissions.map((p) => p.key);

/** Audience tier the agent tailors output depth and redaction to. */
export type Audience = 'hr' | 'leader' | 'bod';

/**
 * Maps the session's roles to an audience tier. HR sees everything; managers
 * (and any explicit `performance.leader` grant) get the Leader tier; everyone
 * else — including BOD and individual employees — falls to the least-privileged
 * `bod` tier, so redaction fails safe.
 */
export function audienceFromRoles(roles: readonly string[]): Audience {
  if (roles.includes('performance.hr')) return 'hr';
  if (roles.includes('performance.manager') || roles.includes('performance.leader'))
    return 'leader';
  return 'bod';
}
