import { describe, expect, it } from 'vitest';
import { hiringAppManifest } from '../../src/index.ts';

describe('hiringAppManifest', () => {
  it('owns the /hiring route namespace', () => {
    expect(hiringAppManifest.routeNamespace).toBe('/hiring');
  });

  it('declares at least one nav section', () => {
    expect(hiringAppManifest.nav.length).toBeGreaterThan(0);
  });
});
