import { type Statement, toManifest } from '@seta/shared-rbac';

export const hiringStatement = {
  'hiring.requisition': ['read', 'open'],
} as const satisfies Statement;

const roleStatements = {
  'hiring.strategic': { 'hiring.requisition': ['read', 'open'] },
  'hiring.recruiter': { 'hiring.requisition': ['read', 'open'] },
  'hiring.viewer': { 'hiring.requisition': ['read'] },
} as const satisfies Record<string, Statement>;

export const hiringRbac = toManifest('hiring', hiringStatement, roleStatements, {
  'hiring.strategic': 'Full hiring administration',
  'hiring.recruiter': 'Run requisitions, candidates, interviews, offers',
  'hiring.viewer': 'Read hiring records',
});

export type HiringPermission = (typeof hiringRbac.permissions)[number]['key'];

export const HIRING_PERMISSIONS = hiringRbac.permissions.map((p) => p.key);
