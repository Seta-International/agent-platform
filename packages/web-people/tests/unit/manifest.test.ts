import { describe, expect, it } from 'vitest';
import { peopleAppManifest } from '../../src/index.ts';

describe('peopleAppManifest', () => {
  it('owns the /people route namespace', () => {
    expect(peopleAppManifest.routeNamespace).toBe('/people');
  });

  it('declares the five prototype tabs in order', () => {
    const items = peopleAppManifest.nav.flatMap((s) => s.items);
    expect(items.map((i) => [i.label, i.to])).toEqual([
      ['Dashboard', '/people'],
      ['Employees', '/people/employees'],
      ['Org Chart', '/people/org'],
      ['Resource Allocation', '/people/allocation'],
      ['Performance', '/people/performance'],
    ]);
  });

  it('gates the app and every nav tab on people.worker.read with none disabled', () => {
    expect(peopleAppManifest.requiredPermissions).toContain('people.worker.read');
    for (const item of peopleAppManifest.nav.flatMap((s) => s.items)) {
      expect(item.requires).toContain('people.worker.read');
      expect(item.disabled).toBeFalsy();
    }
  });

  it('badges only the unbuilt placeholder tabs as Soon', () => {
    const byId = Object.fromEntries(
      peopleAppManifest.nav.flatMap((s) => s.items).map((i) => [i.id, i.badge]),
    );
    expect(byId['people.employees']).toBeUndefined();
    for (const id of [
      'people.dashboard',
      'people.org',
      'people.allocation',
      'people.performance',
    ]) {
      expect(byId[id]).toBe('Soon');
    }
  });
});
