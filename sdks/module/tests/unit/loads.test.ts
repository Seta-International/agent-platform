import { describe, expect, expectTypeOf, it } from 'vitest';
import { type AppManifest, type NavIcon, noNavExtensions } from '../../src/index.ts';

// Stub icon — the contract package must stay free of an icon-library dependency.
const StubIcon: NavIcon = () => null;

describe('@seta/module-sdk AppManifest', () => {
  it('requires id, label, icon, routeNamespace, requiredPermissions, nav, useNavExtensions', () => {
    const m: AppManifest = {
      id: 'planner',
      label: 'Planner',
      icon: StubIcon,
      routeNamespace: '/planner',
      requiredPermissions: [],
      useNavExtensions: noNavExtensions,
      nav: [{ label: 'Work', items: [{ id: 'planner.boards', label: 'Boards', to: '/planner' }] }],
    };
    expect(m.routeNamespace).toBe('/planner');
  });

  it('types routeNamespace as a required string and color as optional', () => {
    expectTypeOf<AppManifest['routeNamespace']>().toEqualTypeOf<string>();
    expectTypeOf<AppManifest['color']>().toEqualTypeOf<string | undefined>();
  });
});
