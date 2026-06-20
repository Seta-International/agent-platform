import { describe, expect, it } from 'vitest';
import { hiringAppManifest } from '../../src/manifest.ts';

describe('hiringAppManifest', () => {
  it('declares the hiring app with a Requisitions nav item gated by read', () => {
    expect(hiringAppManifest.id).toBe('hiring');
    expect(hiringAppManifest.routeNamespace).toBe('/hiring');
    const req = hiringAppManifest.nav[0]?.items.find((i) => i.id === 'hiring.requisitions');
    expect(req?.to).toBe('/hiring/requisitions');
    expect(req?.requires).toContain('hiring.requisition.read');
  });

  it('declares a Settings nav item gated by jd_template read', () => {
    const settings = hiringAppManifest.nav[0]?.items.find((i) => i.id === 'hiring.settings');
    expect(settings?.to).toBe('/hiring/settings');
    expect(settings?.requires).toContain('hiring.jd_template.read');
  });

  it('exposes a Candidates nav item gated on hiring.candidate.read', () => {
    const items = hiringAppManifest.nav.flatMap((g) => g.items);
    const candidates = items.find((i) => i.id === 'hiring.candidates');
    expect(candidates).toBeDefined();
    expect(candidates?.to).toBe('/hiring/candidates');
    expect(candidates?.requires).toContain('hiring.candidate.read');
  });
});
