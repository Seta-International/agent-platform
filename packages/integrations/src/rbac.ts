import { type Statement, toManifest } from '@seta/shared-rbac';

export const integrationsStatement = {
  'integrations.mail': ['read', 'configure'],
  'integrations.m365': ['read', 'config.write'],
  'integrations.mcp': ['read', 'write', 'health.read'],
} as const satisfies Statement;

const roleStatements = {
  'integrations.admin': {
    'integrations.mail': ['read', 'configure'],
    'integrations.m365': ['read', 'config.write'],
    'integrations.mcp': ['read', 'write', 'health.read'],
  },
  'integrations.viewer': {
    'integrations.mail': ['read'],
    'integrations.m365': ['read'],
    'integrations.mcp': ['read', 'health.read'],
  },
} as const satisfies Record<string, Statement>;

export const integrationsRbac = toManifest('integrations', integrationsStatement, roleStatements, {
  'integrations.admin': 'Configure mail, M365, and MCP integrations',
  'integrations.viewer': 'Read integration configuration',
});

export type IntegrationsRoleSlug = (typeof integrationsRbac.roles)[number]['slug'];

export const INTEGRATIONS_ROLE_SLUGS = integrationsRbac.roles.map((r) => r.slug) as Array<
  'integrations.admin' | 'integrations.viewer'
>;

export const INTEGRATIONS_PERMISSIONS = integrationsRbac.permissions.map((p) => p.key);

export const INTEGRATIONS_ROLE_PERMISSIONS = Object.fromEntries(
  integrationsRbac.roles.map((r) => [r.slug, r.permissions]),
) as Record<IntegrationsRoleSlug, string[]>;
