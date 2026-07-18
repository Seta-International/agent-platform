import type { NavSection } from '@seta/module-sdk';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LayoutDashboard, Users } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
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
        label: 'Configuration',
        items: [
          {
            id: 'settings',
            label: 'Settings',
            children: [{ id: 'settings.general', label: 'General', to: '/settings/general' }],
          },
        ],
      },
    ];
    render(toSideNavSections(nested, undefined, DefaultShellLink));
    expect(screen.getByText('Configuration')).toBeInTheDocument();
    expect(screen.getByText('General')).toBeInTheDocument();
  });

  it('renders a link-less onClick item as a button and fires it', async () => {
    const onClick = vi.fn();
    const items: NavSection[] = [
      { label: 'Recents', items: [{ id: 'more', label: 'Show more', onClick }] },
    ];
    render(toSideNavSections(items, undefined, DefaultShellLink));
    const button = screen.getByRole('button', { name: 'Show more' });
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('italicizes an item flagged italic without breaking its button role', () => {
    const items: NavSection[] = [
      { label: 'Recents', items: [{ id: 'more', label: 'Show more', italic: true, onClick() {} }] },
    ];
    const { container } = render(toSideNavSections(items, undefined, DefaultShellLink));
    const wrapper = container.querySelector('span[style*="italic"]');
    expect(wrapper).toBeTruthy();
    expect(wrapper).toContainElement(screen.getByRole('button', { name: 'Show more' }));
  });

  it('honors an explicit isSelected override without a matching activeItemId', () => {
    const items: NavSection[] = [
      {
        label: 'Chat',
        items: [
          {
            id: 'chat',
            label: 'Chat',
            to: '/agent/chat',
            collapsible: { defaultIsCollapsed: false },
            children: [
              { id: 'chat.t1', label: 'Thread 1', isSelected: true, onClick: () => {} },
              { id: 'chat.t2', label: 'Thread 2', onClick: () => {} },
            ],
          },
        ],
      },
    ];
    render(toSideNavSections(items, undefined, DefaultShellLink));
    // Thread 1 declares its own selected state; Thread 2 does not.
    expect(screen.getByRole('button', { name: 'Thread 1' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: 'Thread 2' })).not.toHaveAttribute('aria-current');
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
    render(toSideNavSections(withBadges, undefined, DefaultShellLink));
    expect(screen.getByRole('img', { name: 'Warning' })).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
