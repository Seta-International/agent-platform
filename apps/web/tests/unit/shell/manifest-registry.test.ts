import { type NavManifest, noNavExtensions } from '@seta/module-sdk';
import { Box } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import {
  activeNavId,
  filterNavSections,
  type SessionLike,
  visibleManifests,
} from '../../../src/shell/manifest-registry.ts';

const manifests: NavManifest[] = [
  {
    id: 'planner',
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
            requires: ['planner.admin'],
          },
        ],
      },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: Box,
    requiredPermissions: ['org.admin', 'identity.admin'],
    useNavExtensions: noNavExtensions,
    nav: [
      {
        label: 'Identity & access',
        items: [{ id: 'admin.users', label: 'Users', to: '/admin/users' }],
      },
    ],
  },
];

const adminSession: SessionLike = { role_summary: { roles: ['org.admin', 'planner.admin'] } };
const regularSession: SessionLike = { role_summary: { roles: [] } };

describe('visibleManifests', () => {
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

  it('includes guarded items when user has the role', () => {
    const sections = filterNavSections(manifests[0]!.nav, adminSession);
    expect(sections.map((s) => s.items.map((i) => i.id))).toEqual([
      ['planner.my-tasks', 'planner.trash'],
    ]);
  });

  it('drops sections whose items are all filtered out', () => {
    const guarded: NavManifest['nav'] = [
      {
        label: 'Restricted',
        items: [{ id: 'x.secret', label: 'Secret', to: '/x', requires: ['root'] }],
      },
      {
        label: 'Public',
        items: [{ id: 'x.home', label: 'Home', to: '/' }],
      },
    ];
    const sections = filterNavSections(guarded, regularSession);
    expect(sections.map((s) => s.label)).toEqual(['Public']);
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
