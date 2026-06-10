import { describe, expect, it } from 'vitest';
import { EDITABLE_ROLES, inventoryToManifests } from '../../src/inventory.ts';
import { buildRegistry } from '../../src/registry.ts';

describe('editable roles', () => {
  it('excludes foundation + system roles, includes module roles', () => {
    expect(EDITABLE_ROLES).toContain('knowledge.viewer');
    expect(EDITABLE_ROLES).toContain('planner.contributor');
    expect(EDITABLE_ROLES).not.toContain('org.admin');
    expect(EDITABLE_ROLES).not.toContain('tenant.admin');
    expect(EDITABLE_ROLES).not.toContain('org.viewer');
    expect(EDITABLE_ROLES).not.toContain('system.integrations.m365');
  });
  it('every editable role exists in the registry', () => {
    const reg = buildRegistry(inventoryToManifests());
    for (const r of EDITABLE_ROLES) expect(reg.rolePermissions.has(r)).toBe(true);
  });
  it('identity.role has read + write actions', () => {
    const reg = buildRegistry(inventoryToManifests());
    expect(reg.allPermissions.has('identity.role.read')).toBe(true);
    expect(reg.allPermissions.has('identity.role.write')).toBe(true);
  });
});
