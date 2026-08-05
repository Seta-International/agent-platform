import { describe, expect, it } from 'vitest';
import { pmAppManifest } from '../../src/manifest.ts';

describe('pmAppManifest', () => {
  it('declares the pm app labelled Project Monitoring', () => {
    expect(pmAppManifest.id).toBe('pm');
    expect(pmAppManifest.routeNamespace).toBe('/pm');
    expect(pmAppManifest.label).toBe('Project Monitoring');
    expect(pmAppManifest.requiredPermissions).toContain('pm.account.read');
  });

  it('declares the prototype tabs in order with Accounts and Projects appended', () => {
    const items = pmAppManifest.nav.flatMap((s) => s.items);
    expect(items.map((i) => [i.label, i.to])).toEqual([
      ['Portfolio', '/pm'],
      ['Requests', '/pm/requests'],
      ['Weekly Reports', '/pm/weekly'],
      ['RA Monitoring', '/pm/resourcing'],
      ['Risks & Issues', '/pm/risks'],
      ['KPI Metrics', '/pm/metrics'],
      ['Accounts', '/pm/accounts'],
      ['Projects', '/pm/projects'],
    ]);
  });

  it('keeps real permission gates on built tabs', () => {
    const byId = Object.fromEntries(
      pmAppManifest.nav.flatMap((s) => s.items).map((i) => [i.id, i]),
    );
    expect(byId['pm.requests'].requires).toContain('pm.charter.read');
    expect(byId['pm.projects'].requires).toContain('pm.project.read');
  });

  it('badges only the unbuilt placeholder tabs as Soon', () => {
    const byId = Object.fromEntries(
      pmAppManifest.nav.flatMap((s) => s.items).map((i) => [i.id, i.badge]),
    );
    for (const id of ['pm.risks']) {
      expect(byId[id]).toBe('Soon');
    }
    for (const id of [
      'pm.portfolio',
      'pm.requests',
      'pm.weekly',
      'pm.resourcing',
      'pm.metrics',
      'pm.accounts',
      'pm.projects',
    ]) {
      expect(byId[id]).toBeUndefined();
    }
  });
});
