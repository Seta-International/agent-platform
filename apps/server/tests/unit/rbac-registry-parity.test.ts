import { agentRbac } from '@seta/agent/rbac';
import { identityRbac } from '@seta/identity/rbac';
import { integrationsRbac } from '@seta/integrations/rbac';
import { knowledgeRbac } from '@seta/knowledge/rbac';
import { notificationsRbac } from '@seta/notifications/rbac';
import { plannerRbac } from '@seta/planner/rbac';
import { buildRegistry, INVENTORY, inventoryToManifests } from '@seta/shared-rbac';
import { staffingRbac } from '@seta/staffing/rbac';
import { describe, expect, it } from 'vitest';

// Welds the per-module better-auth statements (declared in each <module>/src/rbac.ts
// and contributed to the ContributionRegistry) to the single authoritative INVENTORY
// that the runtime resolver, identity, and gen:rbac all build from. If a module's
// declared statement drifts from INVENTORY — or a module is added to INVENTORY but
// never gets a manifest — this fails before anything resolves the wrong set.
describe('rbac registry parity', () => {
  const moduleManifests = [
    knowledgeRbac,
    notificationsRbac,
    integrationsRbac,
    staffingRbac,
    agentRbac,
    plannerRbac,
    identityRbac,
  ];

  it('module-declared manifests cover exactly the inventory modules', () => {
    expect(moduleManifests.map((m) => m.module).sort()).toEqual(
      INVENTORY.map((s) => s.module).sort(),
    );
  });

  it('module manifests resolve to the same registry as the authoritative inventory', () => {
    const fromModules = buildRegistry(moduleManifests);
    const fromInventory = buildRegistry(inventoryToManifests(INVENTORY));

    expect([...fromModules.allPermissions].sort()).toEqual(
      [...fromInventory.allPermissions].sort(),
    );
    expect([...fromModules.rolePermissions.keys()].sort()).toEqual(
      [...fromInventory.rolePermissions.keys()].sort(),
    );
    for (const [slug, perms] of fromInventory.rolePermissions) {
      expect([...(fromModules.rolePermissions.get(slug) ?? [])].sort()).toEqual([...perms].sort());
    }
  });
});
