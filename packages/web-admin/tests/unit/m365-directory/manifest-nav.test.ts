import { describe, expect, it } from 'vitest';
import { adminAppManifest } from '../../../src/manifest.ts';

describe('admin manifest — Directory sync nav entry', () => {
  it('sits under Workspace and is gated on the read permission the API requires', () => {
    const workspace = adminAppManifest.nav?.find((section) => section.label === 'Workspace');
    const item = workspace?.items.find((i) => i.id === 'admin.m365-directory');

    expect(item).toBeDefined();
    expect(item?.label).toBe('Directory sync');
    expect(item?.to).toBe('/admin/m365-directory');
    // `integrations.m365.read`, not `.configure`: the two GETs take read, and an admin who can
    // only look should still see the queue rather than a hidden page.
    expect(item?.requires).toEqual(['integrations.m365.read']);
  });
});
