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
  {
    entra_oid: 'oid-2',
    email: 'grace@acme.com',
    display_name: 'Grace Hopper',
    account_enabled: false,
    already_in_seta: false,
  },
]);

const importEntraUsersMock = vi.fn(async (oids: string[]) => ({
  imported: oids,
  skipped: [],
}));

vi.mock('../../../src/sso/api/sso-client.ts', () => ({
  listEntraUsers: () => listEntraUsersMock(),
  importEntraUsers: (oids: string[]) => importEntraUsersMock(oids),
}));

// The "Import from Entra" Button is now a plain sibling of Astryx's `Dialog` (no more
// SheetTrigger) and is rendered exactly once in both enabled states. Dialog always mounts
// regardless of `isOpen`, so "closed" is asserted via the role leaving the a11y tree.
describe('ImportFromEntraDialog', () => {
  beforeEach(() => {
    listEntraUsersMock.mockClear();
    importEntraUsersMock.mockClear();
  });

  // Row selection keys must be Entra OIDs, not TanStack's default row indices — `selectedOids`
  // matches them against `entra_oid`, so with indices nothing is ever selectable and the import
  // can never be submitted.
  it('selects a row by OID and submits that OID to the import API', async () => {
    const user = userEvent.setup();
    const onImported = vi.fn();
    render(<ImportFromEntraDialog enabled onImported={onImported} />);

    await user.click(screen.getByRole('button', { name: 'Import from Entra' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText('ada@acme.com')).toBeInTheDocument());

    // One checkbox per row, plus the header's "Select all" — no duplicate selection column.
    expect(within(dialog).getAllByRole('checkbox', { name: 'Select row' })).toHaveLength(2);

    await user.click(within(dialog).getAllByRole('checkbox', { name: 'Select row' })[0]);
    const submitButton = await within(dialog).findByRole('button', { name: 'Add 1 person' });

    await user.click(submitButton);
    await waitFor(() => expect(importEntraUsersMock).toHaveBeenCalledWith(['oid-1']));
    await waitFor(() => expect(onImported).toHaveBeenCalled());
  });

  it('cannot select a row whose Entra account is disabled', async () => {
    const user = userEvent.setup();
    render(<ImportFromEntraDialog enabled onImported={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Import from Entra' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText('grace@acme.com')).toBeInTheDocument());

    // Grace's account_enabled is false → her row checkbox stays disabled.
    expect(within(dialog).getAllByRole('checkbox', { name: 'Select row' })[1]).toBeDisabled();
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

  // `purpose="form"` removes backdrop-dismiss, so the in-drawer Cancel button is now a dominant
  // exit path: it must run the same reset as Escape and the header close button, or state
  // survives into the next open.
  it('resets row selection when closed via the in-drawer Cancel button', async () => {
    const user = userEvent.setup();
    render(<ImportFromEntraDialog enabled onImported={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Import from Entra' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText('ada@acme.com')).toBeInTheDocument());

    await user.click(within(dialog).getByRole('checkbox', { name: 'Select all rows' }));
    expect(within(dialog).getByRole('checkbox', { name: 'Select all rows' })).toBeChecked();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Import from Entra' }));
    const reopened = await screen.findByRole('dialog');
    expect(within(reopened).getByRole('checkbox', { name: 'Select all rows' })).not.toBeChecked();
  });

  // The global text filter is now consumer-owned (the deleted DataTable's
  // built-in filter is gone): typing narrows the client-side rows in place.
  it('filters the user rows by the typed query', async () => {
    const user = userEvent.setup();
    render(<ImportFromEntraDialog enabled onImported={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Import from Entra' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText('ada@acme.com')).toBeInTheDocument());

    await user.type(within(dialog).getByRole('textbox', { name: /filter users/i }), 'grace');

    await waitFor(() => expect(within(dialog).queryByText('ada@acme.com')).not.toBeInTheDocument());
    expect(within(dialog).getByText('grace@acme.com')).toBeInTheDocument();
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
