import { describe, expect, it } from 'vitest';
import { IMPLICIT_PERMISSIONS, INVENTORY, inventoryToManifests } from '../../src/inventory.ts';
import { canonicalKeys } from '../../src/manifest.ts';

describe('rbac inventory', () => {
  it('every role permission exists in its module statement', () => {
    for (const mod of INVENTORY) {
      const keys = new Set(canonicalKeys(mod.statement));
      for (const role of mod.roles) {
        for (const p of role.permissions) {
          expect(keys.has(p), `${role.slug} → ${p} missing from ${mod.module} statement`).toBe(
            true,
          );
        }
      }
    }
  });

  it('permission keys are unique across modules', () => {
    const seen = new Set<string>();
    for (const mod of INVENTORY) {
      for (const k of canonicalKeys(mod.statement)) {
        expect(seen.has(k), `duplicate ${k}`).toBe(false);
        seen.add(k);
      }
    }
  });

  it('implicit permissions exist in some module statement', () => {
    const all = new Set(INVENTORY.flatMap((m) => canonicalKeys(m.statement)));
    for (const p of IMPLICIT_PERMISSIONS) expect(all.has(p), `implicit ${p} undefined`).toBe(true);
  });

  it('inventoryToManifests yields one manifest per module', () => {
    const manifests = inventoryToManifests();
    expect(manifests.map((m) => m.module)).toEqual(INVENTORY.map((s) => s.module));
    expect(manifests[0].permissions.every((p) => typeof p.key === 'string')).toBe(true);
  });
});
