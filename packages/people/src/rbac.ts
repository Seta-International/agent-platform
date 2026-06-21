import { type Statement, toManifest } from '@seta/shared-rbac';

export const peopleStatement = {
  'people.worker': ['read', 'read.all', 'provision', 'edit', 'portal_access.set'],
} as const satisfies Statement;

const roleStatements = {
  'people.strategic': {
    'people.worker': ['read', 'read.all', 'provision', 'edit', 'portal_access.set'],
    'core.skill': ['read'],
  },
  'people.viewer': { 'people.worker': ['read'] },
} as const satisfies Record<string, Statement>;

export const peopleRbac = toManifest('people', peopleStatement, roleStatements, {
  'people.strategic': 'Full people administration',
  'people.viewer': 'Read people records',
});

export type PeoplePermission = (typeof peopleRbac.permissions)[number]['key'];

export const PEOPLE_PERMISSIONS = peopleRbac.permissions.map((p) => p.key);
