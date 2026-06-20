import { type Statement, toManifest } from '@seta/shared-rbac';

export const pmStatement = {
  'pm.account': ['read', 'manage'],
  'pm.charter': ['submit', 'approve', 'read'],
  'pm.project': ['read', 'manage'],
} as const satisfies Statement;

const roleStatements = {
  'pm.strategic': {
    'pm.account': ['read', 'manage'],
    'pm.charter': ['submit', 'approve', 'read'],
    'pm.project': ['read', 'manage'],
  },
  'pm.viewer': {
    'pm.account': ['read'],
    'pm.charter': ['read'],
    'pm.project': ['read'],
  },
} as const satisfies Record<string, Statement>;

export const pmRbac = toManifest('pm', pmStatement, roleStatements, {
  'pm.strategic': 'Full project-management administration',
  'pm.viewer': 'Read project-management records',
});

export type PmPermission = (typeof pmRbac.permissions)[number]['key'];

export const PM_PERMISSIONS = pmRbac.permissions.map((p) => p.key);
