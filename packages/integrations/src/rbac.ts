import { INVENTORY, inventoryToManifests } from '@seta/shared-rbac';
import { INTEGRATIONS_PERMISSIONS, INTEGRATIONS_ROLE_SLUGS } from './generated/rbac.ts';

export type { IntegrationsPermission } from './generated/rbac.ts';
export { INTEGRATIONS_PERMISSIONS, INTEGRATIONS_ROLE_SLUGS };

// biome-ignore lint/style/noNonNullAssertion: 'integrations' is always in INVENTORY (asserted by codegen-drift.test.ts)
export const integrationsRbac = inventoryToManifests(INVENTORY).find(
  (m) => m.module === 'integrations',
)!;

export type IntegrationsRoleSlug = (typeof INTEGRATIONS_ROLE_SLUGS)[number];

export const INTEGRATIONS_ROLE_PERMISSIONS = Object.fromEntries(
  integrationsRbac.roles.map((r) => [r.slug, r.permissions]),
) as Record<IntegrationsRoleSlug, string[]>;
