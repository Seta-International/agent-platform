import { describe, expect, it } from 'vitest';
import { peopleAppManifest } from '../../src/index.ts';

describe('peopleAppManifest', () => {
  it('owns the /people route namespace', () => {
    expect(peopleAppManifest.routeNamespace).toBe('/people');
  });

  it('gates visibility on the people feature flag', () => {
    expect(peopleAppManifest.requiredFeature).toBe('people');
  });

  it('declares the five People tabs in order', () => {
    const section = peopleAppManifest.nav.find((s) => s.label === 'People');
    expect(section?.items.map((i) => [i.label, i.to])).toEqual([
      ['Dashboard', '/people'],
      ['Employees', '/people/employees'],
      ['Org Chart', '/people/org'],
      ['Resource Allocation', '/people/allocation'],
      ['Performance', '/people/performance'],
    ]);
  });

  it('declares the Journey section with the three lifecycle tabs in order', () => {
    const section = peopleAppManifest.nav.find((s) => s.label === 'Journey');
    expect(section?.items.map((i) => [i.label, i.to])).toEqual([
      ['Onboarding', '/people/onboarding'],
      ['Probation', '/people/probation'],
      ['Offboarding', '/people/offboarding'],
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
    // Built/live tabs carry no badge.
    expect(byId['people.employees']).toBeUndefined();
    expect(byId['people.org']).toBeUndefined();
    for (const id of [
      'people.dashboard',
      'people.allocation',
      'people.performance',
      'people.onboarding',
      'people.probation',
      'people.offboarding',
    ]) {
      expect(byId[id]).toBe('Soon');
    }
  });
});
