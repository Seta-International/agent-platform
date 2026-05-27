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
