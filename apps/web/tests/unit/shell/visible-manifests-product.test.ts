import { describe, expect, it } from 'vitest';
import { visibleManifests } from '../../../src/shell/manifest-registry.ts';

const planner = {
  id: 'planner',
  routeNamespace: '/planner',
  requiredPermissions: [],
  nav: [],
} as never;
const admin = {
  id: 'admin',
  routeNamespace: '/admin',
  requiredPermissions: ['identity.user.list'],
  nav: [],
} as never;

describe('visibleManifests product gate', () => {
  it('hides planner without product access even though it needs no permission', () => {
    const enabled = new Set(['planner', 'admin']);
    const out = visibleManifests(
      [planner, admin],
      { permissions: new Set(['identity.user.list']), product_access: new Set() },
      enabled,
    );
    expect(out.map((m) => m.id)).toEqual(['admin']); // admin not a product → still visible
  });
  it('shows planner once product access is granted', () => {
    const out = visibleManifests(
      [planner],
      { permissions: new Set(), product_access: new Set(['planner']) },
      new Set(['planner']),
    );
    expect(out.map((m) => m.id)).toEqual(['planner']);
  });
});
