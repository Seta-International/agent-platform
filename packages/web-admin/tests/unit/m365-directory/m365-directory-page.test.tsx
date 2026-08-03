import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DirectoryConflictRow,
  DirectorySyncStatus,
} from '../../../src/m365-directory/api/directory-sync-client.ts';
import { M365DirectorySync } from '../../../src/m365-directory/pages/M365DirectorySync.tsx';

const listConflicts = vi.fn();
const getStatus = vi.fn();
const startSync = vi.fn();
const resolve = vi.fn();
const listOrgUnits = vi.fn();

vi.mock('../../../src/m365-directory/api/directory-sync-client.ts', () => ({
  listDirectoryConflicts: (...args: unknown[]) => listConflicts(...args),
  getDirectorySyncStatus: () => getStatus(),
  startDirectorySync: () => startSync(),
  resolveDirectoryConflict: (input: unknown) => resolve(input),
  listOrgUnits: () => listOrgUnits(),
}));

function status(overrides: Partial<DirectorySyncStatus> = {}): DirectorySyncStatus {
  return {
    configured: true,
    last_synced_at: '2026-08-02T03:00:00.000Z',
    last_status: 'ok',
    last_error: null,
    cursor_present: true,
    last_run: {
      occurred_at: '2026-08-02T03:00:00.000Z',
      full: false,
      counters: {
        users_seen: 42,
        users_created: 3,
        users_updated: 5,
        org_units_created: 1,
        photos_missing: 2,
      },
    },
    open_conflicts: 0,
    ...overrides,
  };
}

function conflict(overrides: Partial<DirectoryConflictRow> = {}): DirectoryConflictRow {
  return {
    id: 'c1',
    kind: 'email_collision',
    actions: ['link', 'ignore'],
    subject_type: 'person',
    subject_id: null,
    entra_oid: 'oid-1',
    detail: {
      work_email: 'mai@acme.com',
      full_name: 'Mai Nguyen',
      candidates: [{ person_id: 'p1', full_name: 'Mai N.', work_email: 'mai@acme.com' }],
    },
    status: 'open',
    resolution: null,
    resolved_by: null,
    resolved_at: null,
    first_seen_at: '2026-08-01T00:00:00.000Z',
    last_seen_at: '2026-08-02T00:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <M365DirectorySync />
    </QueryClientProvider>,
  );
  return qc;
}

beforeEach(() => {
  getStatus.mockResolvedValue(status());
  listConflicts.mockResolvedValue([]);
  startSync.mockResolvedValue({ enqueued: true, full: true });
  resolve.mockResolvedValue({ resolved: true });
  listOrgUnits.mockResolvedValue([]);
});

afterEach(() => vi.clearAllMocks());

describe('M365DirectorySync — run status', () => {
  it('renders the §11 counters from the last run', async () => {
    renderPage();
    expect(await screen.findByText('42')).toBeInTheDocument();
    expect(screen.getByText('Seen')).toBeInTheDocument();
    expect(screen.getByText('Photos missing')).toBeInTheDocument();
  });

  it('Sync now posts a full run and stays disabled until the run leaves a mark', async () => {
    const user = userEvent.setup();
    renderPage();

    const button = await screen.findByRole('button', { name: 'Sync now' });
    await user.click(button);

    await waitFor(() => expect(startSync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Syncing…' })).toBeDisabled());
  });

  it('shows the reason when the last run failed', async () => {
    getStatus.mockResolvedValue(status({ last_status: 'error', last_error: 'Graph 403' }));
    renderPage();
    expect(await screen.findByText(/Graph 403/)).toBeInTheDocument();
  });

  it('says so when M365 is not connected instead of showing an empty run', async () => {
    getStatus.mockResolvedValue(
      status({ configured: false, last_synced_at: null, last_run: null }),
    );
    renderPage();
    expect(await screen.findByText(/Microsoft 365 is not connected yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeDisabled();
  });
});

describe('M365DirectorySync — empty state', () => {
  it('reads as "nothing needs you", not as a broken or loading page', async () => {
    renderPage();

    expect(await screen.findByText('Nothing needs you')).toBeInTheDocument();
    expect(
      screen.getByText(
        /matched everyone in Microsoft 365 to a person here without having to guess/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Loading conflicts…')).not.toBeInTheDocument();
    expect(screen.getByText('Up to date')).toBeInTheDocument();
  });

  it('only ever asks for open conflicts, so resolved rows never appear', async () => {
    renderPage();
    await screen.findByText('Nothing needs you');
    expect(listConflicts).toHaveBeenCalledWith('open');
  });
});

describe('M365DirectorySync — conflict queue', () => {
  it('renders one button per served action and nothing else', async () => {
    listConflicts.mockResolvedValue([conflict()]);
    getStatus.mockResolvedValue(status({ open_conflicts: 1 }));
    renderPage();

    expect(await screen.findByText('Mai Nguyen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link to a person' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ignore' })).toBeInTheDocument();
    // §9.1's table still lists `create_new` for this kind; the resolver rejects it, and the
    // served `actions` array is what the screen renders.
    expect(screen.queryByRole('button', { name: /create/i })).not.toBeInTheDocument();
  });

  it('follows the served actions even when they contradict the conflict kind', async () => {
    // Same kind, a narrower offer: proof the buttons are data-driven, not looked up from `kind`.
    listConflicts.mockResolvedValue([conflict({ actions: ['ignore'] })]);
    renderPage();

    await screen.findByText('Mai Nguyen');
    expect(screen.getByRole('button', { name: 'Ignore' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Link to a person' })).not.toBeInTheDocument();
  });

  it('posts a param-less action straight from the row', async () => {
    const user = userEvent.setup();
    listConflicts.mockResolvedValue([conflict({ actions: ['ignore'] })]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Ignore' }));

    await waitFor(() =>
      expect(resolve).toHaveBeenCalledWith({ conflictId: 'c1', action: 'ignore' }),
    );
  });

  it('collects the person for an action that needs one before posting', async () => {
    const user = userEvent.setup();
    listConflicts.mockResolvedValue([conflict()]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Link to a person' }));

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: /Mai N\./ }));
    await user.click(within(dialog).getByRole('button', { name: 'Link to a person' }));

    await waitFor(() =>
      expect(resolve).toHaveBeenCalledWith({
        conflictId: 'c1',
        action: 'link',
        params: { person_id: 'p1' },
      }),
    );
  });

  it('groups by kind and explains that a renamed department clears itself', async () => {
    listConflicts.mockResolvedValue([
      conflict(),
      conflict({
        id: 'c2',
        kind: 'unit_delete_blocked',
        actions: ['reassign', 'keep', 'ignore'],
        subject_type: 'org_unit',
        subject_id: 'u1',
        detail: { unit_name: 'Data Platform', member_count: 4, child_count: 1 },
      }),
    ]);
    renderPage();

    expect(await screen.findByText('Department gone from Entra')).toBeInTheDocument();
    expect(screen.getByText('Email already belongs to someone')).toBeInTheDocument();
    expect(screen.getByText(/a rename arrives as a delete plus a create/)).toBeInTheDocument();
    expect(screen.getByText(/it clears itself on the next run/)).toBeInTheDocument();
    expect(screen.getByText(/still holds 4 people and 1 sub-unit/)).toBeInTheDocument();
  });

  it('surfaces a refusal (200 + resolved:false) on the row that was refused', async () => {
    const user = userEvent.setup();
    resolve.mockResolvedValue({ resolved: false, reason: 'delete_refused' });
    listConflicts.mockResolvedValue([
      conflict({
        id: 'c2',
        kind: 'unit_delete_blocked',
        actions: ['keep', 'ignore'],
        subject_type: 'org_unit',
        subject_id: 'u1',
        detail: { unit_name: 'Data Platform', member_count: 4, child_count: 0 },
      }),
    ]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Keep the unit' }));

    expect(await screen.findByText(/delete refused/)).toBeInTheDocument();
  });
});
