import { type AppManifest, noNavExtensions } from '@seta/module-sdk';
import { Box, LayoutDashboard } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import {
  activeAppId,
  activeNavId,
  filterNavSections,
  type SessionLike,
  visibleManifests,
} from '../../../src/shell/manifest-registry.ts';

const manifests: AppManifest[] = [
  {
    id: 'planner',
    routeNamespace: '/planner',
    label: 'Planner',
    icon: Box,
    requiredPermissions: [],
    useNavExtensions: noNavExtensions,
    nav: [
      {
        label: 'Work',
        items: [
          { id: 'planner.my-tasks', label: 'My tasks', to: '/planner/my-tasks' },
          {
            id: 'planner.trash',
            label: 'Trash',
            to: '/planner/trash',
            requires: ['planner.trash.read'],
          },
        ],
      },
    ],
  },
  {
    id: 'admin',
    routeNamespace: '/admin',
    label: 'Admin',
    icon: Box,
    requiredPermissions: ['identity.user.list'],
    useNavExtensions: noNavExtensions,
    nav: [
      {
        label: 'Identity & access',
        items: [{ id: 'admin.users', label: 'Users', to: '/admin/users' }],
      },
    ],
  },
];

const s = (perms: string[]): SessionLike => ({ permissions: new Set(perms) });
const adminSession = s(['identity.user.list', 'planner.trash.read']);
const regularSession = s([]);

describe('visibleManifests', () => {
  it('gates manifests by permission', () => {
    const m = [
      {
        id: 'admin',
        requiredPermissions: ['identity.user.list'],
        label: '',
        icon: (() => null) as never,
        nav: [],
        useNavExtensions: () => [],
      } as never,
    ];
    expect(visibleManifests(m, s(['identity.user.list']), new Set(['admin']))).toHaveLength(1);
    expect(visibleManifests(m, s([]), new Set(['admin']))).toHaveLength(0);
  });

  it('hides admin section from non-admin users', () => {
    const visible = visibleManifests(
      manifests,
      regularSession,
      new Set(manifests.map((m) => m.id)),
    );
    expect(visible.map((m) => m.id)).toEqual(['planner']);
  });

  it('shows admin section to admin users', () => {
    const visible = visibleManifests(manifests, adminSession, new Set(manifests.map((m) => m.id)));
    expect(visible.map((m) => m.id)).toEqual(['planner', 'admin']);
  });

  it('hides modules not in enabled set', () => {
    const visible = visibleManifests(manifests, adminSession, new Set(['planner']));
    expect(visible.map((m) => m.id)).toEqual(['planner']);
  });
});

describe('filterNavSections', () => {
  it('filters per-item `requires` inside each section', () => {
    const sections = filterNavSections(manifests[0]!.nav, regularSession);
    expect(sections.map((s) => s.items.map((i) => i.id))).toEqual([['planner.my-tasks']]);
  });

  it('includes guarded items when user has the permission', () => {
    const sections = filterNavSections(manifests[0]!.nav, adminSession);
    expect(sections.map((s) => s.items.map((i) => i.id))).toEqual([
      ['planner.my-tasks', 'planner.trash'],
    ]);
  });

  it('PMO with only people.performance.read keeps Performance, drops directory items', () => {
    const peopleNav: AppManifest['nav'] = [
      {
        label: 'People',
        items: [
          {
            id: 'people.employees',
            label: 'Employees',
            to: '/people/employees',
            requires: ['people.worker.read'],
          },
          {
            id: 'people.performance',
            label: 'Performance',
            to: '/people/performance',
            requires: ['people.performance.read'],
          },
        ],
      },
    ];
    const sections = filterNavSections(peopleNav, s(['people.performance.read']));
    expect(sections.map((sec) => sec.items.map((i) => i.id))).toEqual([['people.performance']]);
  });
});

describe('activeNavId', () => {
  it('resolves direct matches', () => {
    expect(activeNavId(manifests, '/planner/my-tasks')).toBe('planner.my-tasks');
    expect(activeNavId(manifests, '/admin/users')).toBe('admin.users');
  });

  it('matches deeper paths to the closest parent', () => {
    expect(activeNavId(manifests, '/planner/my-tasks/123')).toBe('planner.my-tasks');
  });

  it('returns undefined when nothing matches', () => {
    expect(activeNavId(manifests, '/somewhere-else')).toBeUndefined();
  });
});

const appsForActive = [
  {
    id: 'planner',
    label: 'Planner',
    icon: LayoutDashboard,
    routeNamespace: '/planner',
    requiredPermissions: [],
    useNavExtensions: () => [],
    nav: [],
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: LayoutDashboard,
    routeNamespace: '/admin',
    requiredPermissions: [],
    useNavExtensions: () => [],
    nav: [],
  },
] as AppManifest[];

describe('activeAppId', () => {
  it('matches the app whose routeNamespace prefixes the path', () => {
    expect(activeAppId(appsForActive, '/planner/groups/1')).toBe('planner');
    expect(activeAppId(appsForActive, '/admin')).toBe('admin');
  });
  it('returns undefined when no namespace matches', () => {
    expect(activeAppId(appsForActive, '/account')).toBeUndefined();
  });
  it('resolves a hideInLauncher system app (Settings) for chrome', () => {
    const withSettings = [
      ...appsForActive,
      {
        id: 'settings',
        label: 'Settings',
        icon: LayoutDashboard,
        routeNamespace: '/settings',
        requiredPermissions: [],
        hideInLauncher: true,
        useNavExtensions: () => [],
        nav: [],
      },
    ] as AppManifest[];
    expect(activeAppId(withSettings, '/settings/profile')).toBe('settings');
    expect(activeAppId(withSettings, '/settings')).toBe('settings');
  });
});
