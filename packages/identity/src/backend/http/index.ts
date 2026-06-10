import type { RouteBuildDeps, SessionEnv } from '@seta/core';
import { Hono } from 'hono';
import { registerAdminAuditRoutes } from './admin-audit.ts';
import { registerAdminUsersRoutes } from './admin-users.ts';
import { registerProfileRoutes } from './profile.ts';
import { registerRoleAccessRoutes } from './role-access.ts';
import { registerSsoConsentRoutes } from './sso-consent.ts';
import { registerSsoEntraGraphRoutes } from './sso-entra-graph.ts';
import { registerSsoProvidersRoutes } from './sso-providers.ts';
import { registerTenantSettingsRoutes } from './tenant-settings.ts';
import { registerUsersEmailRoutes } from './users-email.ts';

export { registerAdminAuditRoutes } from './admin-audit.ts';
export { registerAdminUsersRoutes } from './admin-users.ts';
export { registerProfileRoutes } from './profile.ts';
export { registerRoleAccessRoutes } from './role-access.ts';
export { registerSsoConsentRoutes } from './sso-consent.ts';
export { registerSsoEntraGraphRoutes } from './sso-entra-graph.ts';
export { registerSsoProvidersRoutes } from './sso-providers.ts';
export { registerTenantSettingsRoutes } from './tenant-settings.ts';
export { registerUsersEmailRoutes } from './users-email.ts';

export function buildIdentityRoutes(_deps: RouteBuildDeps): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  registerProfileRoutes(app);
  registerAdminUsersRoutes(app);
  registerAdminAuditRoutes(app);
  registerRoleAccessRoutes(app);
  registerUsersEmailRoutes(app);
  registerSsoConsentRoutes(app);
  registerSsoProvidersRoutes(app);
  registerSsoEntraGraphRoutes(app);
  registerTenantSettingsRoutes(app);
  return app;
}
