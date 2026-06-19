import { describe, expect, it } from 'vitest';
import { peopleAppManifest } from '../../src/index.ts';

describe('peopleAppManifest', () => {
  it('owns the /people route namespace', () => {
    expect(peopleAppManifest.routeNamespace).toBe('/people');
  });

  it('declares at least one nav section', () => {
    expect(peopleAppManifest.nav.length).toBeGreaterThan(0);
  });

  it('gates the app and every nav tab on people.worker.read', () => {
    expect(peopleAppManifest.requiredPermissions).toContain('people.worker.read');
    for (const section of peopleAppManifest.nav) {
      for (const item of section.items) {
        expect(item.requires).toContain('people.worker.read');
      }
    }
  });
});
