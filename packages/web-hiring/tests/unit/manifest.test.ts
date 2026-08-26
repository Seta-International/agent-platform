import { describe, expect, it } from 'vitest';
import { hiringAppManifest } from '../../src/manifest.ts';

describe('hiringAppManifest', () => {
  it('declares the hiring app labelled Hiring Management', () => {
    expect(hiringAppManifest.id).toBe('hiring');
    expect(hiringAppManifest.routeNamespace).toBe('/hiring');
    expect(hiringAppManifest.label).toBe('Hiring Management');
  });

  it('declares the prototype tabs in order with Settings appended', () => {
    const items = hiringAppManifest.nav.flatMap((s) => s.items);
    expect(items.map((i) => [i.label, i.to])).toEqual([
      ['Reports', '/hiring'],
      ['Requisitions', '/hiring/requisitions'],
      ['Candidates', '/hiring/candidates'],
      ['Interviews', '/hiring/interviews'],
      ['Knowledge Base', '/hiring/knowledge'],
      ['Settings', '/hiring/settings'],
    ]);
  });

  it('keeps real permission gates on built tabs', () => {
    const byId = Object.fromEntries(
      hiringAppManifest.nav.flatMap((s) => s.items).map((i) => [i.id, i]),
    );
    expect(byId['hiring.requisitions']!.requires).toContain('hiring.requisition.read');
    expect(byId['hiring.candidates']!.requires).toContain('hiring.candidate.read');
    expect(byId['hiring.settings']!.requires).toContain('hiring.jd_template.read');
  });

  it('badges only the unbuilt placeholder tabs as Soon', () => {
    const byId = Object.fromEntries(
      hiringAppManifest.nav.flatMap((s) => s.items).map((i) => [i.id, i.badge]),
    );
    for (const id of ['hiring.reports', 'hiring.knowledge']) {
      expect(byId[id]).toBe('Soon');
    }
    for (const id of [
      'hiring.requisitions',
      'hiring.candidates',
      'hiring.interviews',
      'hiring.settings',
    ]) {
      expect(byId[id]).toBeUndefined();
    }
  });
});
