import { describe, expect, it } from 'vitest';
import { peopleAppManifest } from '../../src/index.ts';

describe('peopleAppManifest', () => {
  it('owns the /people route namespace', () => {
    expect(peopleAppManifest.routeNamespace).toBe('/people');
  });

  it('declares at least one nav section', () => {
    expect(peopleAppManifest.nav.length).toBeGreaterThan(0);
  });
});
