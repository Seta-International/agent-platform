import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('../../../src/auth-client.ts', () => ({
  authClient: { signOut: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../../src/components/SessionProvider.tsx', () => ({
  useSession: () => ({ display_name: 'Tran Canh', email: 'canh@example.com' }),
}));

import { UserMenu } from '../../../src/components/UserMenu.tsx';

function renderUserMenu() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <UserMenu />
    </QueryClientProvider>,
  );
}

describe('UserMenu trigger', () => {
  // The trigger is an icon-only Astryx Button: the Avatar rides in the `icon`
  // slot because `isIconOnly` drops `children` entirely (FUT-725 hover-pill fix).
  it('renders the avatar inside the account trigger', () => {
    renderUserMenu();
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    const avatar = screen.getByRole('img', { name: 'Tran Canh' });
    expect(trigger).toContainElement(avatar);
  });

  it('opens the menu with account info and actions', async () => {
    const user = userEvent.setup();
    renderUserMenu();
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(await screen.findByText('canh@example.com')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
  });
});
