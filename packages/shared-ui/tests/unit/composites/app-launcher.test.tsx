import { type AppManifest, noNavExtensions } from '@seta/module-sdk';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LayoutDashboard, Settings, Sparkles } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { AppLauncher } from '../../../src/composites/app-launcher';

const APPS: AppManifest[] = [
  {
    id: 'planner',
    label: 'Planner',
    icon: LayoutDashboard,
    routeNamespace: '/planner',
    requiredPermissions: [],
    useNavExtensions: noNavExtensions,
    nav: [],
  },
  {
    id: 'agent',
    label: 'Agent Studio',
    icon: Sparkles,
    routeNamespace: '/agent',
    requiredPermissions: [],
    useNavExtensions: noNavExtensions,
    nav: [],
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: Settings,
    routeNamespace: '/admin',
    requiredPermissions: [],
    useNavExtensions: noNavExtensions,
    nav: [],
  },
];

describe('AppLauncher', () => {
  it('renders a tile per app with its label', () => {
    render(<AppLauncher apps={APPS} currentAppId="planner" onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /Planner/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Agent Studio/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Admin/ })).toBeInTheDocument();
  });
  it('marks the current app with aria-current', () => {
    render(<AppLauncher apps={APPS} currentAppId="agent" onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /Agent Studio/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('button', { name: /Planner/ })).not.toHaveAttribute(
      'aria-current',
      'true',
    );
  });
  it('calls onSelect with the app id when a tile is clicked', async () => {
    const onSelect = vi.fn();
    render(<AppLauncher apps={APPS} currentAppId="planner" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: /Agent Studio/ }));
    expect(onSelect).toHaveBeenCalledWith('agent');
  });
  it('calls onClose after a selection, to close an enclosing popover', async () => {
    const onClose = vi.fn();
    render(
      <AppLauncher apps={APPS} currentAppId="planner" onSelect={() => {}} onClose={onClose} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Agent Studio/ }));
    expect(onClose).toHaveBeenCalled();
  });
  it('omits apps flagged hideInLauncher', () => {
    const withSystem: AppManifest[] = [
      ...APPS,
      {
        id: 'settings',
        label: 'Settings',
        icon: Settings,
        routeNamespace: '/settings',
        requiredPermissions: [],
        hideInLauncher: true,
        useNavExtensions: noNavExtensions,
        nav: [],
      },
    ];
    render(<AppLauncher apps={withSystem} currentAppId="planner" onSelect={() => {}} />);
    expect(screen.queryByRole('button', { name: /Settings/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Planner/ })).toBeInTheDocument();
  });
  it('renders disabled apps as non-interactive with a "Soon" marker', async () => {
    const onSelect = vi.fn();
    const withSoon = [
      ...APPS,
      {
        id: 'people',
        label: 'People',
        icon: LayoutDashboard,
        routeNamespace: '/people',
        requiredPermissions: [],
        useNavExtensions: noNavExtensions,
        nav: [],
      },
    ];
    render(
      <AppLauncher
        apps={withSoon}
        currentAppId="planner"
        disabledAppIds={['people']}
        onSelect={onSelect}
      />,
    );
    const people = screen.getByRole('button', { name: /People/ });
    expect(people).toBeDisabled();
    expect(screen.getByText(/Soon/i)).toBeInTheDocument();
    await userEvent.click(people);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
