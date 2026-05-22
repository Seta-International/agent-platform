import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AppShell } from './app-shell';
import type { ShellNavModule } from './left-nav';

const MODULES: ShellNavModule[] = [
  {
    id: 'copilot',
    label: 'Copilot',
    icon: 'sparkles',
    items: [
      { id: 'copilot.chat', icon: 'inbox', label: 'Chat', disabled: true },
      { id: 'copilot.workflows', icon: 'workflow', label: 'Workflows', disabled: true },
    ],
  },
  {
    id: 'planner',
    label: 'Planner',
    icon: 'board',
    items: [{ id: 'planner.groups', icon: 'users', label: 'Groups', href: '/planner/groups' }],
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: 'building',
    items: [{ id: 'admin.users', icon: 'users', label: 'Users', href: '/admin/users' }],
  },
];

function renderShell(activeItemId = 'planner.groups') {
  return render(
    <AppShell workspace="Acme · Engineering" modules={MODULES} activeItemId={activeItemId}>
      <div>page content</div>
    </AppShell>,
  );
}

describe('AppShell', () => {
  it('opens the module that contains the active item by default and keeps others collapsed', () => {
    renderShell('planner.groups');

    expect(screen.getByRole('button', { name: 'Planner' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Copilot' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByText('Groups')).toBeInTheDocument();
  });

  it('keeps only one module expanded at a time', async () => {
    const user = userEvent.setup();
    renderShell('planner.groups');

    await user.click(screen.getByRole('button', { name: 'Admin' }));

    expect(screen.getByRole('button', { name: 'Admin' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Planner' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('collapses the sidebar to the icon rail and restores it', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: /Collapse sidebar/i }));
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Expand sidebar/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Expand sidebar/i }));
    expect(screen.getByText('Workspace')).toBeInTheDocument();
  });

  it('toggles the copilot panel via the topbar button', async () => {
    const user = userEvent.setup();
    renderShell();

    expect(screen.queryByRole('complementary', { name: /Copilot/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Show copilot panel/i }));
    expect(screen.getByRole('complementary', { name: /Copilot/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Hide copilot panel/i }));
    expect(screen.queryByRole('complementary', { name: /Copilot/i })).not.toBeInTheDocument();
  });

  it('toggles the copilot panel with the ⌘\\ shortcut', async () => {
    const user = userEvent.setup();
    renderShell();

    expect(screen.queryByRole('complementary', { name: /Copilot/i })).not.toBeInTheDocument();
    await user.keyboard('{Meta>}\\{/Meta}');
    expect(screen.getByRole('complementary', { name: /Copilot/i })).toBeInTheDocument();
    await user.keyboard('{Meta>}\\{/Meta}');
    expect(screen.queryByRole('complementary', { name: /Copilot/i })).not.toBeInTheDocument();
  });

  it('renders disabled nav items as non-link spans with a tooltip', () => {
    renderShell('copilot.chat');
    const chat = screen.getByText('Chat').closest('span[aria-disabled]');
    expect(chat).toHaveAttribute('aria-disabled', 'true');
    expect(chat).toHaveAttribute('title', 'Coming soon');
  });
});
