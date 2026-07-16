import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactElement } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EditGroupDialog } from '../../../src/components/RenameGroupDialog';
import { makeGroup } from '../../../src/testing/fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const baseGroup = makeGroup({
  id: 'g1',
  name: 'Engineering',
  description: 'Platform work',
  theme: 'blue',
  visibility: 'private',
  default_role: 'member',
  external_source: 'native',
  version: 3,
});

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderDialog(props: Partial<React.ComponentProps<typeof EditGroupDialog>> = {}) {
  const qc = makeQueryClient();
  const merged: React.ComponentProps<typeof EditGroupDialog> = {
    group: baseGroup,
    open: true,
    onOpenChange: vi.fn(),
    ...props,
  };
  const withQc = (el: ReactElement) => <QueryClientProvider client={qc}>{el}</QueryClientProvider>;
  const utils = render(withQc(<EditGroupDialog {...merged} />));
  return {
    ...utils,
    qc,
    props: merged,
    rerenderWith: (next: Partial<React.ComponentProps<typeof EditGroupDialog>>) =>
      utils.rerender(withQc(<EditGroupDialog {...merged} {...next} />)),
  };
}

describe('EditGroupDialog', () => {
  // Astryx's real Dialog always mounts <dialog> + children regardless of `isOpen`. purpose="form"
  // renders role="dialog". DialogHeader doesn't wire aria-labelledby, so assert the title via its
  // heading rather than the dialog's accessible name — matching this batch's established pattern.
  it('opens and shows the group current name, description, theme, visibility, and default role', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Edit group' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Engineering');
    expect(screen.getByLabelText('Description')).toHaveValue('Platform work');
    expect(screen.getByRole('button', { name: 'blue' })).toHaveAttribute('aria-pressed', 'true');
    // `SegmentedControl` here is shared-ui's own composite wrapper (options/onValueChange API),
    // not the raw Astryx primitive — it renders role="tablist"/"tab" with aria-selected.
    expect(screen.getByRole('tab', { name: 'Private' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Member' })).toHaveAttribute('aria-selected', 'true');
  });

  it('is not exposed as a dialog when closed', () => {
    renderDialog({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('editing a field enables the Save button (hasChanges)', async () => {
    const user = userEvent.setup();
    renderDialog();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Engineering Renamed');

    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
  });

  it('clicking Save calls the update mutation with the expected patch and closes on success', async () => {
    const user = userEvent.setup();
    const captured: unknown[] = [];
    server.use(
      http.patch('*/api/planner/v1/groups/g1', async ({ request }) => {
        captured.push(await request.json());
        return HttpResponse.json(makeGroup({ ...baseGroup, name: 'Engineering Renamed' }));
      }),
    );
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Engineering Renamed');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(captured).toHaveLength(1));
    expect(captured[0]).toMatchObject({
      expected_version: 3,
      patch: { name: 'Engineering Renamed' },
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('clicking Cancel closes without saving', async () => {
    const user = userEvent.setup();
    const captured: unknown[] = [];
    server.use(
      http.patch('*/api/planner/v1/groups/g1', async ({ request }) => {
        captured.push(await request.json());
        return HttpResponse.json(baseGroup);
      }),
    );
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Should not be saved');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(captured).toHaveLength(0);
  });

  // Finding 1 regression guard: `group` comes from a react-query cache with default
  // `refetchOnWindowFocus` — a background refetch that returns content-different data produces a
  // new object reference for the *same* group (structural sharing). Before the fix, the
  // reset-effect's dependency array included `group`, so this reference change (while the dialog
  // was already open) fired the reset and silently wiped the in-progress edit below.
  it('does NOT reset an unsaved edit when `group` changes reference while the dialog stays open', async () => {
    const user = userEvent.setup();
    const { rerenderWith } = renderDialog();

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Unsaved Edit');
    expect(screen.getByLabelText('Name')).toHaveValue('Unsaved Edit');

    // Same id/content, new object reference — simulates a react-query background refetch.
    rerenderWith({ group: { ...baseGroup } });

    expect(screen.getByLabelText('Name')).toHaveValue('Unsaved Edit');
  });

  // The other half of the contract: reopening after a genuine close must still reset to fresh
  // values (the pre-migration conditional-mount behavior this effect reproduces).
  it('resets to fresh values the next time the dialog is opened after being closed', async () => {
    const user = userEvent.setup();
    const { rerenderWith } = renderDialog();

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Unsaved Edit');
    expect(screen.getByLabelText('Name')).toHaveValue('Unsaved Edit');

    rerenderWith({ open: false });
    rerenderWith({ open: true, group: { ...baseGroup, name: 'Engineering' } });

    expect(screen.getByLabelText('Name')).toHaveValue('Engineering');
  });
});
