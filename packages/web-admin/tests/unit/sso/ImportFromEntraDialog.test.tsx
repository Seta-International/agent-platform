import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportFromEntraDialog } from '../../../src/sso/components/ImportFromEntraDialog.tsx';

const listEntraUsersMock = vi.fn(async () => [
  {
    entra_oid: 'oid-1',
    email: 'ada@acme.com',
    display_name: 'Ada Lovelace',
    account_enabled: true,
    already_in_seta: false,
  },
]);

vi.mock('../../../src/sso/api/sso-client.ts', () => ({
  listEntraUsers: () => listEntraUsersMock(),
  importEntraUsers: vi.fn(async () => ({ imported: [], skipped: [] })),
}));

// The "Import from Entra" Button is now a plain sibling of Astryx's `Dialog` (no more
// SheetTrigger) and is rendered exactly once in both enabled states. Dialog always mounts
// regardless of `isOpen`, so "closed" is asserted via the role leaving the a11y tree.
describe('ImportFromEntraDialog', () => {
  beforeEach(() => {
    listEntraUsersMock.mockClear();
  });

  it('is not exposed as a dialog until the trigger is clicked', () => {
    render(<ImportFromEntraDialog enabled onImported={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the trigger exactly once whether or not Entra is enabled', () => {
    const { rerender } = render(<ImportFromEntraDialog enabled onImported={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: 'Import from Entra' })).toHaveLength(1);

    rerender(<ImportFromEntraDialog enabled={false} onImported={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: 'Import from Entra' })).toHaveLength(1);
  });

  it('opens the labeled drawer and loads importable users when enabled', async () => {
    const user = userEvent.setup();
    render(<ImportFromEntraDialog enabled onImported={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Import from Entra' }));

    const dialog = await screen.findByRole('dialog', { name: 'Import from Entra ID' });
    expect(
      within(dialog).getByRole('heading', { name: 'Import from Entra ID' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(listEntraUsersMock).toHaveBeenCalled());
    await waitFor(() => expect(within(dialog).getByText('ada@acme.com')).toBeInTheDocument());
  });

  it('keeps the drawer closed when Entra is disabled', async () => {
    const user = userEvent.setup();
    render(<ImportFromEntraDialog enabled={false} onImported={vi.fn()} />);

    // The disabled trigger sits inside the Tooltip branch; clicking must not open the drawer.
    await user.click(screen.getByRole('button', { name: 'Import from Entra' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(listEntraUsersMock).not.toHaveBeenCalled();
  });
});
