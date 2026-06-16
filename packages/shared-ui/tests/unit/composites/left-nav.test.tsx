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
  it('renders the active app header and its section labels + items', () => {
    render(<LeftNav app={PLANNER} activeItemId="planner.boards" />);
    expect(screen.getByText('Planner')).toBeInTheDocument();
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Manage')).toBeInTheDocument();
    expect(screen.getByText('Boards')).toBeInTheDocument();
    expect(screen.getByText('Groups')).toBeInTheDocument();
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
});
