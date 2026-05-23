import { type NavManifest, noNavExtensions } from '@seta/module-sdk';
import { Box } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import {
  activeNavId,
  filterNavItems,
  type SessionLike,
  visibleManifests,
} from './manifest-registry.ts';

const manifests: NavManifest[] = [
  {
    id: 'planner',
    label: 'Planner',
    icon: Box,
    requiredPermissions: [],
    useNavExtensions: noNavExtensions,
    nav: [
      { id: 'planner.my-tasks', label: 'My tasks', to: '/planner/my-tasks' },
      { id: 'planner.trash', label: 'Trash', to: '/planner/trash', requires: ['planner.admin'] },
    ],
  },
  {
    id: 'console',
    label: 'Admin',
    icon: Box,
    requiredPermissions: ['org.admin', 'identity.admin'],
    useNavExtensions: noNavExtensions,
    nav: [{ id: 'console.users', label: 'Users', to: '/admin/users' }],
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
    expect(visible.map((m) => m.id)).toEqual(['planner', 'console']);
  });

  it('hides modules not in enabled set', () => {
    const visible = visibleManifests(manifests, adminSession, new Set(['planner']));
    expect(visible.map((m) => m.id)).toEqual(['planner']);
  });
});

describe('filterNavItems', () => {
  it('filters per-item `requires`', () => {
    const items = filterNavItems(manifests[0]!.nav, regularSession);
    expect(items.map((i) => i.id)).toEqual(['planner.my-tasks']);
  });

  it('includes guarded items when user has the role', () => {
    const items = filterNavItems(manifests[0]!.nav, adminSession);
    expect(items.map((i) => i.id)).toEqual(['planner.my-tasks', 'planner.trash']);
  });
});

describe('activeNavId', () => {
  it('resolves direct matches', () => {
    expect(activeNavId(manifests, '/planner/my-tasks')).toBe('planner.my-tasks');
    expect(activeNavId(manifests, '/admin/users')).toBe('console.users');
  });

  it('matches deeper paths to the closest parent', () => {
    expect(activeNavId(manifests, '/planner/my-tasks/123')).toBe('planner.my-tasks');
  });

  it('returns undefined when nothing matches', () => {
    expect(activeNavId(manifests, '/somewhere-else')).toBeUndefined();
  });
});
