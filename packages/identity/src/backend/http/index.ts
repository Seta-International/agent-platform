import type { RouteBuildDeps, SessionEnv } from '@seta/core';
import { Hono } from 'hono';
import { registerAdminAuditRoutes } from './admin-audit.ts';
import { registerAdminUsersRoutes } from './admin-users.ts';
import { registerDirectoryRoutes } from './directory.ts';
import { registerFeatureFlagsRoutes } from './feature-flags.ts';
import { registerGroupRoutes } from './groups.ts';
import { registerProfileRoutes } from './profile.ts';
import { registerRoleAccessRoutes } from './role-access.ts';
import { registerSkillCatalogRoutes } from './skill-catalog.ts';
import { registerSsoConsentRoutes } from './sso-consent.ts';
import { registerSsoEntraGraphRoutes } from './sso-entra-graph.ts';
import { registerSsoProvidersRoutes } from './sso-providers.ts';
import { registerTenantSettingsRoutes } from './tenant-settings.ts';
import { registerUsersEmailRoutes } from './users-email.ts';

export { registerAdminAuditRoutes } from './admin-audit.ts';
export { registerAdminUsersRoutes } from './admin-users.ts';
export { registerDirectoryRoutes } from './directory.ts';
export { registerFeatureFlagsRoutes } from './feature-flags.ts';
export { registerGroupRoutes } from './groups.ts';
export { registerProfileRoutes } from './profile.ts';
export { registerRoleAccessRoutes } from './role-access.ts';
export { registerSkillCatalogRoutes } from './skill-catalog.ts';
export { registerSsoConsentRoutes } from './sso-consent.ts';
export { registerSsoEntraGraphRoutes } from './sso-entra-graph.ts';
export { registerSsoProvidersRoutes } from './sso-providers.ts';
export { registerTenantSettingsRoutes } from './tenant-settings.ts';
export { registerUsersEmailRoutes } from './users-email.ts';

export function buildIdentityRoutes(_deps: RouteBuildDeps): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  registerProfileRoutes(app);
  registerAdminUsersRoutes(app);
  registerDirectoryRoutes(app);
  registerAdminAuditRoutes(app);
  registerGroupRoutes(app);
  registerRoleAccessRoutes(app);
  registerSkillCatalogRoutes(app);
  registerUsersEmailRoutes(app);
  registerSsoConsentRoutes(app);
  registerSsoProvidersRoutes(app);
  registerSsoEntraGraphRoutes(app);
  registerTenantSettingsRoutes(app);
  registerFeatureFlagsRoutes(app);
  return app;
}
