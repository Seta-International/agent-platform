import { describe, expect, it } from 'vitest';
import { peopleAppManifest } from '../../src/index.ts';

describe('peopleAppManifest', () => {
  it('owns the /people route namespace', () => {
    expect(peopleAppManifest.routeNamespace).toBe('/people');
  });

  it('declares the People tabs in order', () => {
    const section = peopleAppManifest.nav.find((s) => s.label === 'People');
    expect(section?.items.map((i) => [i.label, i.to])).toEqual([
      ['Dashboard', '/people'],
      ['Employees', '/people/employees'],
      ['Org Chart', '/people/org'],
      ['Resource Allocation', '/people/allocation'],
      ['Performance', '/people/performance'],
      ['Morale', '/people/morale'],
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

  it('gates every nav tab on its permission with none disabled', () => {
    // App tile shows for either directory readers or performance-only roles (PMO/BoD).
    expect(peopleAppManifest.requiredPermissions).toContain('people.worker.read');
    expect(peopleAppManifest.requiredPermissions).toContain('people.performance.read');
    for (const item of peopleAppManifest.nav.flatMap((s) => s.items)) {
      if (item.id === 'people.performance' || item.id === 'people.morale') {
        expect(item.requires).toContain('people.performance.read');
        expect(item.requires).not.toContain('people.worker.read');
      } else {
        expect(item.requires).toContain('people.worker.read');
      }
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
    expect(byId['people.allocation']).toBeUndefined();
    expect(byId['people.performance']).toBeUndefined(); // live since FUT-692 (entry gate)
    expect(byId['people.morale']).toBeUndefined();
    for (const id of [
      'people.dashboard',
      'people.onboarding',
      'people.probation',
      'people.offboarding',
    ]) {
      expect(byId[id]).toBe('Soon');
    }
  });
});
