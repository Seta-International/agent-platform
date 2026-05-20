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

export const A2_PERMISSIONS = [
  'identity.sso.read',
  'identity.sso.write',
  'identity.user.email.change',
  'identity.user.write.self',
] as const;

export type A2Permission = (typeof A2_PERMISSIONS)[number];
