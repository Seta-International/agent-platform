import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MoraleInboxNote, MoraleInboxProjectGroup } from '../../../src/api/people-client.ts';
import { MoraleInboxTab } from '../../../src/pages/morale-inbox-tab.tsx';

const fetchMoraleInbox = vi.fn();
const fetchMoraleInboxFilters = vi.fn();
const markMoraleNoteRead = vi.fn();

vi.mock('../../../src/api/people-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/api/people-client.ts')>()),
  fetchMoraleInbox: (...args: unknown[]) => fetchMoraleInbox(...args),
  fetchMoraleInboxFilters: (...args: unknown[]) => fetchMoraleInboxFilters(...args),
  markMoraleNoteRead: (...args: unknown[]) => markMoraleNoteRead(...args),
}));

function note(n: number, overrides: Partial<MoraleInboxNote> = {}): MoraleInboxNote {
  return {
    id: `note-${n}`,
    sender_person_id: `sender-${n}`,
    sender_name: `Sender ${n}`,
    sender_capacity: 'member',
    submitted_at: `2026-08-${String(28 - n).padStart(2, '0')}T09:00:00.000Z`,
    concern_text: `Concern ${n}`,
    recipient_tags: ['hr'],
    is_read: true,
    ...overrides,
  };
}

function group(name: string, notes: MoraleInboxNote[], id: string): MoraleInboxProjectGroup {
  return {
    project_id: id,
    project_name: name,
    total_notes: notes.length,
    unread_notes: notes.filter((x) => !x.is_read).length,
    notes,
  };
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MoraleInboxTab />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMoraleInboxFilters.mockResolvedValue({ projects: [], senders: [] });
});

describe('Notes Received paging (FUT-786)', () => {
  it('shows five projects at a time, then five more, and back to five', async () => {
    const user = userEvent.setup();
    const projects = Array.from({ length: 12 }, (_, i) =>
      group(`Project ${i}`, [note(i)], `p-${i}`),
    );
    fetchMoraleInbox.mockResolvedValue({ total_notes: 12, unread_notes: 0, projects });

    renderTab();

    expect(await screen.findByText('Project 0')).toBeInTheDocument();
    expect(screen.queryByText('Project 5')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show 5 more' }));
    expect(screen.getByText('Project 9')).toBeInTheDocument();
    expect(screen.queryByText('Project 10')).not.toBeInTheDocument();

    // The last page is short, and the button says so rather than promising five.
    await user.click(screen.getByRole('button', { name: 'Show 2 more' }));
    expect(screen.getByText('Project 11')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.queryByText('Project 5')).not.toBeInTheDocument();
    expect(screen.getByText('Project 0')).toBeInTheDocument();
  });

  it('shows five notes inside a project, then the rest in one go', async () => {
    const user = userEvent.setup();
    const notes = Array.from({ length: 8 }, (_, i) => note(i));
    fetchMoraleInbox.mockResolvedValue({
      total_notes: 8,
      unread_notes: 0,
      projects: [group('Project Atlas', notes, 'p-1')],
    });

    renderTab();

    expect(await screen.findByText('Sender 0')).toBeInTheDocument();
    expect(screen.queryByText('Sender 5')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show 3 more' }));
    expect(screen.getByText('Sender 7')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.queryByText('Sender 7')).not.toBeInTheDocument();
  });
});

describe('Notes Received filters (FUT-786)', () => {
  const twoProjects = {
    projects: [
      { project_id: 'p-atlas', name: 'Project Atlas' },
      { project_id: 'p-nova', name: 'Team Nova' },
    ],
    senders: [
      { person_id: 's-1', full_name: 'Atlas Person', project_id: 'p-atlas' },
      { person_id: 's-2', full_name: 'Nova Person', project_id: 'p-nova' },
    ],
  };

  /** The "everything" option each filter always keeps, which is how we tell them apart. */
  type Sentinel = 'All projects' | 'Anyone';

  /**
   * Astryx keeps a Selector's options in a popover that stays mounted and labels the
   * listbox with its own trigger, so both halves are reachable from either one.
   */
  function selector(sentinel: Sentinel) {
    const listbox = Array.from(
      document.querySelectorAll<HTMLElement>('[role="listbox"][aria-labelledby]'),
    ).find((lb) => within(lb).queryByRole('option', { name: sentinel, hidden: true }));
    if (!listbox) throw new Error(`no filter offering "${sentinel}"`);
    const trigger = document.getElementById(listbox.getAttribute('aria-labelledby') ?? '');
    if (!trigger) throw new Error(`"${sentinel}" filter has no trigger`);
    return { listbox, trigger };
  }

  function optionsOf(sentinel: Sentinel): string[] {
    return within(selector(sentinel).listbox)
      .getAllByRole('option', { hidden: true })
      .map((o) => o.textContent ?? '');
  }

  async function choose(sentinel: Sentinel, option: string, user: UserEvent) {
    await user.click(selector(sentinel).trigger);
    // The popover remounts on open, so the listbox is looked up again after the click.
    await user.click(
      within(selector(sentinel).listbox).getByRole('option', { name: option, hidden: true }),
    );
  }

  async function renderFilters() {
    fetchMoraleInboxFilters.mockResolvedValue(twoProjects);
    fetchMoraleInbox.mockResolvedValue({ total_notes: 0, unread_notes: 0, projects: [] });
    renderTab();
    await screen.findByRole('option', { name: 'Project Atlas', hidden: true });
  }

  it('narrows the sender list to the chosen project, and back', async () => {
    const user = userEvent.setup();
    await renderFilters();

    expect(optionsOf('Anyone')).toEqual(['Anyone', 'Atlas Person', 'Nova Person']);

    await choose('All projects', 'Team Nova', user);

    // Atlas's people never wrote from Nova, so offering them would select nothing.
    expect(optionsOf('Anyone')).toEqual(['Anyone', 'Nova Person']);

    await choose('All projects', 'All projects', user);
    expect(optionsOf('Anyone')).toEqual(['Anyone', 'Atlas Person', 'Nova Person']);
  });

  it('limits the project list to the chosen sender, and drops a project they never wrote from', async () => {
    const user = userEvent.setup();
    await renderFilters();

    expect(optionsOf('All projects')).toEqual(['All projects', 'Project Atlas', 'Team Nova']);

    await choose('Anyone', 'Nova Person', user);

    expect(optionsOf('All projects')).toEqual(['All projects', 'Team Nova']);
  });
});

describe('Reading a note (FUT-786)', () => {
  it('marks it read on open and puts the badge back if the server refuses', async () => {
    const user = userEvent.setup();
    const unread = note(1, { is_read: false, concern_text: 'Scope changed three times.' });
    fetchMoraleInbox.mockResolvedValue({
      total_notes: 1,
      unread_notes: 1,
      projects: [group('Project Atlas', [unread], 'p-1')],
    });
    markMoraleNoteRead.mockRejectedValue(new Error('offline'));

    renderTab();

    await user.click(await screen.findByText('Sender 1'));

    expect(markMoraleNoteRead).toHaveBeenCalledWith('note-1');
    // The optimistic clear is rolled back, so the group's unread count survives a failure.
    await waitFor(() => expect(screen.getByText('1 unread')).toBeInTheDocument());
  });
});
