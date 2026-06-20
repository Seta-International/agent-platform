import { describe, expect, it } from 'vitest';
import { pmAppManifest } from '../../src/manifest.ts';

describe('pmAppManifest', () => {
  it('declares the pm app with a read-gated nav item', () => {
    expect(pmAppManifest.id).toBe('pm');
    expect(pmAppManifest.routeNamespace).toBe('/pm');
    expect(pmAppManifest.requiredPermissions).toContain('pm.account.read');
    expect(pmAppManifest.nav[0].items[0].requires).toContain('pm.account.read');
  });
});
