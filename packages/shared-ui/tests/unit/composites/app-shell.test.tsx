import { type AppManifest, noNavExtensions } from '@seta/module-sdk';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Building2, LayoutDashboard, Sparkles, Users } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../../src/composites/app-shell';

const APPS: AppManifest[] = [
  {
    id: 'agent',
    label: 'Agent Studio',
    icon: Sparkles,
    routeNamespace: '/agent',
    requiredPermissions: [],
    useNavExtensions: noNavExtensions,
    nav: [{ label: 'Workspace', items: [{ id: 'agent.chat', label: 'Chat', to: '/agent/chat' }] }],
  },
  {
    id: 'planner',
    label: 'Planner',
    icon: LayoutDashboard,
    routeNamespace: '/planner',
    requiredPermissions: [],
    useNavExtensions: noNavExtensions,
    nav: [
      {
        label: 'Work',
        items: [{ id: 'planner.groups', icon: Users, label: 'Groups', to: '/planner/groups' }],
      },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: Building2,
    routeNamespace: '/admin',
    requiredPermissions: [],
    useNavExtensions: noNavExtensions,
    nav: [
      {
        label: 'Access',
        items: [{ id: 'admin.users', icon: Users, label: 'Users', to: '/admin/users' }],
      },
    ],
  },
];

function renderShell(props: Partial<React.ComponentProps<typeof AppShell>> = {}) {
  return render(
    <AppShell
      apps={APPS}
      activeAppId="planner"
      activeItemId="planner.groups"
      onAppSelect={() => {}}
      {...props}
    >
      <div>page content</div>
    </AppShell>,
  );
}

describe('AppShell (suite)', () => {
  it('renders only the active app nav in the sidebar', () => {
    renderShell();
    // Scoped by role, not plain text: the launcher popover and the mobile nav
    // drawer are always mounted (just closed), and render the same app/nav
    // labels — getByText would match both the visible and the closed copy.
    expect(screen.getByRole('link', { name: 'Planner' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Groups' })).toBeInTheDocument();
    expect(screen.queryByText('Chat')).not.toBeInTheDocument();
  });

  it('opens the launcher and selects another app', async () => {
    const onAppSelect = vi.fn();
    const user = userEvent.setup();
    renderShell({ onAppSelect });
    await user.click(screen.getByRole('button', { name: /Open app launcher/i }));
    await user.click(screen.getByRole('button', { name: /Agent Studio/ }));
    expect(onAppSelect).toHaveBeenCalledWith('agent');
  });

  it('includes useNavExtensions sections in the mobile nav drawer, not just the sidebar', () => {
    const appsWithExtensions: AppManifest[] = APPS.map((app) =>
      app.id === 'planner'
        ? {
            ...app,
            useNavExtensions: () => [
              {
                label: 'Recent',
                items: [{ id: 'planner.recent.q3', label: 'Q3 Launch', to: '/planner/q3' }],
              },
            ],
          }
        : app,
    );
    renderShell({ apps: appsWithExtensions });
    // Once in the visible sidebar (LeftNav), once in the always-mounted-but-hidden mobile
    // drawer (MobileNavSections) — both compute the same [...nav, ...useNavExtensions()] merge.
    expect(screen.getAllByText('Q3 Launch')).toHaveLength(2);
  });
});
