import { describe, expect, it } from 'vitest';
import { pmAppManifest } from '../../src/index.ts';

describe('pmAppManifest', () => {
  it('owns the /pm route namespace', () => {
    expect(pmAppManifest.routeNamespace).toBe('/pm');
  });

  it('declares at least one nav section', () => {
    expect(pmAppManifest.nav.length).toBeGreaterThan(0);
  });
});
