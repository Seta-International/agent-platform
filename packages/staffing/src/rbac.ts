import { type Statement, toManifest } from '@seta/shared-rbac';

export const staffingStatement = {
  staffing: ['read'],
  'staffing.workflow': ['read', 'run', 'cancel'],
} as const satisfies Statement;

const roleStatements = {
  'staffing.operator': {
    staffing: ['read'],
    'staffing.workflow': ['read', 'run', 'cancel'],
  },
  'staffing.viewer': {
    staffing: ['read'],
    'staffing.workflow': ['read'],
  },
} as const satisfies Record<string, Statement>;

export const staffingRbac = toManifest('staffing', staffingStatement, roleStatements, {
  'staffing.operator': 'Run and cancel staffing workflows',
  'staffing.viewer': 'Read staffing workflows',
});

export type StaffingPermission = (typeof staffingRbac.permissions)[number]['key'];

export const STAFFING_PERMISSIONS = staffingRbac.permissions.map((p) => p.key);

export const STAFFING_ROLE_SLUGS = staffingRbac.roles.map((r) => r.slug) as Array<
  'staffing.operator' | 'staffing.viewer'
>;
export type StaffingRoleSlug = (typeof STAFFING_ROLE_SLUGS)[number];

export const STAFFING_ROLE_PERMISSIONS = Object.fromEntries(
  staffingRbac.roles.map((r) => [r.slug, r.permissions]),
) as Record<StaffingRoleSlug, string[]>;
