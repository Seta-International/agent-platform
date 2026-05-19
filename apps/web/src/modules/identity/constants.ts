export const TENANT_ROLE_SLUGS = [
  'org.admin',
  'org.viewer',
  'identity.admin',
  'identity.viewer',
  'copilot.admin',
  'copilot.contributor',
  'copilot.viewer',
  'integrations.admin',
  'integrations.viewer',
  'planner.admin',
] as const;

export type TenantRoleSlug = (typeof TENANT_ROLE_SLUGS)[number];
