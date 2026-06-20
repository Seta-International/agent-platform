import { describe, expect, it } from 'vitest';
import { hiringAppManifest } from '../../src/manifest.ts';

describe('hiringAppManifest', () => {
  it('declares the hiring app with a read-gated nav item', () => {
    expect(hiringAppManifest.id).toBe('hiring');
    expect(hiringAppManifest.routeNamespace).toBe('/hiring');
    expect(hiringAppManifest.requiredPermissions).toContain('hiring.requisition.read');
    expect(hiringAppManifest.nav[0].items[0].requires).toContain('hiring.requisition.read');
  });
});
