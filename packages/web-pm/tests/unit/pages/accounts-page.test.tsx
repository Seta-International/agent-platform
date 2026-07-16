import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountsPage } from '../../../src/pages/accounts-page.tsx';

vi.mock('@seta/web-identity', () => ({
  usePermission: () => true,
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));

const createAccount = vi.fn();
vi.mock('../../../src/api/pm-client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/pm-client.ts')>();
  return {
    ...actual,
    fetchAccounts: () => Promise.resolve([]),
    createAccount: (input: unknown) => createAccount(input),
  };
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AccountsPage />
    </QueryClientProvider>,
  );
}

describe('AccountsPage — CreateAccountDialog (Astryx migration smoke test)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    createAccount.mockReset();
  });

  // purpose="form" -> role="dialog". Astryx's Dialog/DialogHeader don't wire aria-labelledby,
  // so scope with within() and assert the title via its heading — established pattern from
  // this migration batch (see RenameGroupDialog.test.tsx / cancel-requisition-dialog.test.tsx).
  it('opens from the New account trigger and closes via Cancel without creating anything', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New account' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Create account' })).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Name *'), 'Should not save');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(createAccount).not.toHaveBeenCalled();
  });

  it('submits the entered name/industry on Create and closes the dialog on success', async () => {
    createAccount.mockResolvedValueOnce({ account_id: 'acc-9' });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'New account' }));
    const dialog = screen.getByRole('dialog');

    await user.type(within(dialog).getByLabelText('Name *'), 'Aeris');
    await user.type(within(dialog).getByLabelText('Industry'), 'Fintech');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(createAccount).toHaveBeenCalledWith({ name: 'Aeris', industry: 'Fintech' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
