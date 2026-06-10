import { type Statement, toManifest } from '@seta/shared-rbac';

export const identityStatement = {
  'identity.user': [
    'read',
    'read.any',
    'read.self',
    'write',
    'write.self',
    'deactivate',
    'invite',
    'email.change',
  ],
  'identity.sso': ['read', 'write'],
  'identity.role': ['grant'],
  'identity.role_grant': ['read', 'write'],
  'identity.password': ['disable_local'],
  'identity.concept_map': ['read', 'write'],
  'core.tenant': ['read', 'write'],
  'core.audit': ['read'],
} as const satisfies Statement;

const roleStatements = {
  'identity.admin': {
    'identity.user': ['read.any', 'write', 'deactivate', 'invite', 'email.change'],
    'identity.sso': ['read', 'write'],
    'identity.role': ['grant'],
    'identity.role_grant': ['read', 'write'],
    'identity.password': ['disable_local'],
    'identity.concept_map': ['read', 'write'],
  },
  'identity.viewer': {
    'identity.user': ['read.any'],
    'identity.role_grant': ['read'],
    'identity.concept_map': ['read'],
  },
} as const satisfies Record<string, Statement>;

export const identityRbac = toManifest('identity', identityStatement, roleStatements, {
  'identity.admin': 'Manage users, roles, SSO, and identity settings',
  'identity.viewer': 'Read users, role grants, and concept maps',
});

export type IdentityPermission = (typeof identityRbac.permissions)[number]['key'];
export const IDENTITY_ROLE_SLUGS = identityRbac.roles.map((r) => r.slug) as Array<
  'identity.admin' | 'identity.viewer'
>;
export type IdentityRoleSlug = (typeof IDENTITY_ROLE_SLUGS)[number];
export const IDENTITY_ROLE_PERMISSIONS = Object.fromEntries(
  identityRbac.roles.map((r) => [r.slug, r.permissions]),
) as Record<IdentityRoleSlug, string[]>;

export const TENANT_ROLE_SLUGS = [
  'org.admin',
  'org.viewer',
  'identity.admin',
  'identity.viewer',
  'agent.admin',
  'agent.contributor',
  'agent.viewer',
  'integrations.admin',
  'integrations.viewer',
  'planner.admin',
] as const;

export type TenantRoleSlug = (typeof TENANT_ROLE_SLUGS)[number];

export const A2_PERMISSIONS = [
  'identity.sso.read',
  'identity.sso.write',
  'identity.user.email.change',
  'identity.user.write.self',
] as const;

export type A2Permission = (typeof A2_PERMISSIONS)[number];
