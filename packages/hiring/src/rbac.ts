import { type Statement, toManifest } from '@seta/shared-rbac';

export const hiringStatement = {
  'hiring.requisition': ['read', 'open', 'manage', 'close'],
  'hiring.jd_template': ['read', 'manage'],
  'hiring.candidate': ['read', 'create', 'manage', 'reject', 'transfer'],
  'hiring.rejection_reason': ['read', 'manage'],
} as const satisfies Statement;

const full = hiringStatement;

const roleStatements = {
  'hiring.strategic': { ...full, 'core.skill': ['read'] },
  'hiring.recruiter': { ...full, 'core.skill': ['read'] },
  'hiring.viewer': {
    'hiring.requisition': ['read'],
    'hiring.jd_template': ['read'],
    'hiring.candidate': ['read'],
    'hiring.rejection_reason': ['read'],
  },
} as const satisfies Record<string, Statement>;

export const hiringRbac = toManifest('hiring', hiringStatement, roleStatements, {
  'hiring.strategic': 'Full hiring administration',
  'hiring.recruiter': 'Run requisitions, candidates, interviews, offers',
  'hiring.viewer': 'Read hiring records',
});

export type HiringPermission = (typeof hiringRbac.permissions)[number]['key'];
export const HIRING_PERMISSIONS = hiringRbac.permissions.map((p) => p.key);
