import { type Statement, toManifest } from '@seta/shared-rbac';

export const coreStatement = {
  'core.skill': ['read', 'manage'],
} as const satisfies Statement;

const roleStatements = {
  'core.admin': {
    'core.skill': ['read', 'manage'],
  },
} as const satisfies Record<string, Statement>;

export const coreRbac = toManifest(
  'core',
  coreStatement,
  roleStatements,
  {
    'core.admin': 'Manage the system-wide skill catalog',
  },
  {
    'core.skill.read': 'Read the skill catalog',
    'core.skill.manage': 'Create, edit, and archive catalog skills and categories',
  },
);

export type CorePermission = (typeof coreRbac.permissions)[number]['key'];

export const CORE_PERMISSIONS = coreRbac.permissions.map((p) => p.key);
