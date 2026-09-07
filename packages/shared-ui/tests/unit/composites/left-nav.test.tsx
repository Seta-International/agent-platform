import { type AppManifest, noNavExtensions } from '@seta/module-sdk';
import { render, screen } from '@testing-library/react';
import { LayoutDashboard, Users } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { LeftNav } from '../../../src/composites/left-nav';

const PLANNER: AppManifest = {
  id: 'planner',
  label: 'Planner',
  icon: LayoutDashboard,
  routeNamespace: '/planner',
  requiredPermissions: [],
  useNavExtensions: noNavExtensions,
  nav: [
    {
      label: 'Work',
      items: [{ id: 'planner.boards', icon: LayoutDashboard, label: 'Boards', to: '/planner' }],
    },
    {
      label: 'Manage',
      items: [{ id: 'planner.groups', icon: Users, label: 'Groups', to: '/planner/groups' }],
    },
  ],
};

describe('LeftNav (single active app)', () => {
  it('renders section labels + items (no redundant app header)', () => {
    render(<LeftNav app={PLANNER} activeItemId="planner.boards" />);
    expect(screen.queryByText('Planner')).not.toBeInTheDocument();
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Manage')).toBeInTheDocument();
    expect(screen.getByText('Boards')).toBeInTheDocument();
    expect(screen.getByText('Groups')).toBeInTheDocument();
  });
  it('collapsed: every nav item stays directly visible as an icon link', () => {
    render(<LeftNav app={PLANNER} activeItemId="planner.boards" collapsed />);
    expect(screen.getByRole('link', { name: 'Boards' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Groups' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument();
  });
  it('marks the active item with aria-current=page', () => {
    render(<LeftNav app={PLANNER} activeItemId="planner.groups" />);
    expect(screen.getByText('Groups').closest('a')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Boards').closest('a')).not.toHaveAttribute('aria-current', 'page');
  });
  it('appends dynamic sections from useNavExtensions', () => {
    const app: AppManifest = {
      ...PLANNER,
      useNavExtensions: () => [
        {
          label: 'Pinned',
          items: [{ id: 'planner.pinned', label: 'My board', to: '/planner/p/1' }],
        },
      ],
    };
    render(<LeftNav app={app} activeItemId="planner.boards" />);
    expect(screen.getByText('Pinned')).toBeInTheDocument();
    expect(screen.getByText('My board')).toBeInTheDocument();
  });

  it('lets an explicitly selected dynamic item win over the prefix-matched activeItemId', () => {
    // activeItemId is a longest-prefix match over static items, so an app-root item
    // ('/planner') matches every page in the app. Without deferring to the dynamic
    // item's own isSelected, both would render selected at once.
    const app: AppManifest = {
      ...PLANNER,
      useNavExtensions: () => [
        {
          label: 'Pinned',
          items: [
            { id: 'planner.pinned', label: 'My board', to: '/planner/p/1', isSelected: true },
          ],
        },
      ],
    };
    render(<LeftNav app={app} activeItemId="planner.boards" />);
    const selected = screen.getAllByRole('link').filter((a) => a.dataset.selected);
    expect(selected.map((a) => a.textContent)).toEqual(['My board']);
  });
});
