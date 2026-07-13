import type { NavSection } from '@seta/module-sdk';
import { render, screen } from '@testing-library/react';
import { LayoutDashboard, Users } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { toSideNavSections } from '../../../src/composites/nav-sections';
import { DefaultShellLink } from '../../../src/composites/shell-link';

const SECTIONS: NavSection[] = [
  {
    label: 'Work',
    items: [
      { id: 'boards', icon: LayoutDashboard, label: 'Boards', to: '/planner' },
      { id: 'groups', icon: Users, label: 'Groups', to: '/planner/groups' },
    ],
  },
  {
    label: 'Empty',
    items: [],
  },
];

function Harness({ activeItemId }: { activeItemId?: string }) {
  return <>{toSideNavSections(SECTIONS, activeItemId, DefaultShellLink)}</>;
}

describe('toSideNavSections', () => {
  it('renders section titles and item labels', () => {
    render(<Harness />);
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Boards')).toBeInTheDocument();
    expect(screen.getByText('Groups')).toBeInTheDocument();
  });

  it('drops sections with zero items', () => {
    render(<Harness />);
    expect(screen.queryByText('Empty')).not.toBeInTheDocument();
  });

  it('marks the active item with aria-current=page', () => {
    render(<Harness activeItemId="groups" />);
    expect(screen.getByText('Groups').closest('a')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Boards').closest('a')).not.toHaveAttribute('aria-current', 'page');
  });

  it('renders nested children as sub-items', () => {
    const nested: NavSection[] = [
      {
        label: 'Settings',
        items: [
          {
            id: 'settings',
            label: 'Settings',
            children: [{ id: 'settings.general', label: 'General', to: '/settings/general' }],
          },
        ],
      },
    ];
    render(<>{toSideNavSections(nested, undefined, DefaultShellLink)}</>);
    expect(screen.getAllByText('Settings')).toHaveLength(3); // section header + nav item + hidden label
    expect(screen.getByText('General')).toBeInTheDocument();
  });

  it('renders a status dot for badgeTone and text for badge count', () => {
    const withBadges: NavSection[] = [
      {
        label: 'Alerts',
        items: [
          {
            id: 'conflicts',
            label: 'Conflicts',
            to: '/integrations/conflicts',
            badge: '2',
            badgeTone: 'warning',
          },
        ],
      },
    ];
    render(<>{toSideNavSections(withBadges, undefined, DefaultShellLink)}</>);
    expect(screen.getByRole('img', { name: 'Warning' })).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
