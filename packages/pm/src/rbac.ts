import { type Statement, toManifest } from '@seta/shared-rbac';

export const pmStatement = {
  'pm.account': ['read', 'manage'],
  'pm.charter': ['submit', 'pmo_signoff', 'bod_approve', 'read'],
  'pm.project': ['read', 'manage'],
} as const satisfies Statement;

const roleStatements = {
  'pm.strategic': {
    'pm.account': ['read', 'manage'],
    'pm.charter': ['submit', 'read'],
    'pm.project': ['read', 'manage'],
  },
  'pm.pmo': {
    'pm.account': ['read'],
    'pm.charter': ['pmo_signoff', 'read'],
    'pm.project': ['read', 'manage'],
  },
  'pm.bod': {
    'pm.charter': ['bod_approve', 'read'],
    'pm.project': ['read'],
  },
  'pm.viewer': {
    'pm.account': ['read'],
    'pm.charter': ['read'],
    'pm.project': ['read'],
  },
} as const satisfies Record<string, Statement>;

export const pmRbac = toManifest('pm', pmStatement, roleStatements, {
  'pm.strategic': 'Raises charters and runs delivery (no approval gate)',
  'pm.pmo': 'PMO review gate + post-approval staffing & access',
  'pm.bod': 'Board final approval gate',
  'pm.viewer': 'Read project-management records',
});

export type PmPermission = (typeof pmRbac.permissions)[number]['key'];

export const PM_PERMISSIONS = pmRbac.permissions.map((p) => p.key);
