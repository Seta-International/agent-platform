import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
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

function note(n: number, isRead: boolean): MoraleInboxNote {
  return {
    id: `note-${n}`,
    sender_person_id: `sender-${n}`,
    sender_name: `Sender ${n}`,
    sender_capacity: 'member',
    submitted_at: `2026-08-${String(28 - n).padStart(2, '0')}T09:00:00.000Z`,
    concern_text: `Concern ${n}`,
    recipient_tags: ['hr'],
    my_tags: ['hr'],
    is_read: isRead,
  };
}

function group(notes: MoraleInboxNote[]): MoraleInboxProjectGroup {
  return {
    project_id: 'p-atlas',
    project_name: 'Project Atlas',
    total_notes: notes.length,
    unread_notes: notes.filter((n) => !n.is_read).length,
    notes,
  };
}

function rowFor(sender: string): HTMLElement {
  const row = screen.getByText(sender).closest('li');
  if (!row) throw new Error(`no row for ${sender}`);
  return row;
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMoraleInboxFilters.mockResolvedValue({ projects: [], senders: [] });
  fetchMoraleInbox.mockResolvedValue({
    total_notes: 2,
    unread_notes: 1,
    projects: [group([note(1, false), note(2, true)])],
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MoraleInboxTab />
    </QueryClientProvider>,
  );
});

describe('Notes Received unread treatment (FUT-786)', () => {
  it('rules the leading edge of an unread row and lets a read one recede', async () => {
    await screen.findByText('Sender 1');

    // Drawn inside the row rather than as a border, so both states share one geometry —
    // a real border would nudge every unread row's text sideways by its own width.
    expect(rowFor('Sender 1').style.boxShadow).toContain('--color-text-blue');
    expect(rowFor('Sender 2').style.boxShadow).toBe('');

    // Unread holds a field of its own and read falls back to the card, so the pair
    // separate by ground as well as by the rule.
    expect(rowFor('Sender 1').style.backgroundColor).toContain('--color-background-muted');
    expect(rowFor('Sender 2').style.backgroundColor).toContain('--color-background-card');
  });

  it('leaves neither row to change colour under the pointer', async () => {
    await screen.findByText('Sender 1');

    // Astryx tints an interactive row on hover with the same muted grey an unread row
    // sits on, so a hovered read row read as unread for as long as the pointer stayed.
    // Naming a background inline is what switches that off — it outranks the class — so
    // both rows have to name one, including the read row that only wants the card colour.
    for (const sender of ['Sender 1', 'Sender 2']) {
      expect(rowFor(sender).style.backgroundColor).not.toBe('');
    }
  });

  it('still says "unread" to a reader who cannot see the rule', async () => {
    await screen.findByText('Sender 1');

    // A coloured edge is exactly the kind of state WCAG 1.4.1 refuses to let colour carry
    // alone. The word stays in the accessibility tree even though it left the screen.
    expect(within(rowFor('Sender 1')).getByText('Unread')).toBeInTheDocument();
    expect(within(rowFor('Sender 2')).queryByText('Unread')).not.toBeInTheDocument();
  });

  it('counts a group’s unread notes as a figure, not a sentence', async () => {
    await screen.findByText('Project Atlas');

    // The header already says "2 notes"; repeating "unread" beside it spends a word on
    // what the badge's position and colour say. The name stays on the badge for AT.
    const badge = screen.getByLabelText('1 unread');
    expect(badge).toHaveTextContent(/^1$/);
    expect(screen.queryByText('1 unread')).not.toBeInTheDocument();
  });

  it('parks the count against the far edge of the header rather than the project name', async () => {
    await screen.findByText('Project Atlas');

    // Astryx sizes a Collapsible trigger's content to its own width and fixes the chevron
    // after it, so neither the padding, the leading chevron nor the far-edge count exists
    // without the header-trigger class. Asserted here because losing it costs all three
    // silently, with every element still present and correctly ordered.
    const badge = screen.getByLabelText('1 unread');
    expect(badge.closest('.seta-collapsible-header-trigger')).not.toBeNull();
  });

  it('rules one note off from the next, and the header off from the first', async () => {
    await screen.findByText('Project Atlas');

    // Astryx draws both edges in --color-border — 8% black, which is invisible where it
    // has to work hardest: between a white read row and a grey unread one. Only the
    // colour is overridden on the rows, so the width and the last-child suppression stay
    // Astryx's and the bottom of the list still closes without a line.
    for (const sender of ['Sender 1', 'Sender 2']) {
      expect(rowFor(sender).style.borderBlockEndColor).toContain('--color-border-emphasized');
    }

    // Nothing at all sits between a Collapsible's trigger and its content, so without
    // this the project name rested straight on the first sender's and the two read as
    // one block. A component rather than a border on the list, so an empty group still
    // closes its header off.
    const header = screen.getByText('Project Atlas').closest('.seta-collapsible-header-trigger');
    const group = header?.parentElement;
    if (!group) throw new Error('no group around the project header');
    const rule = group.querySelector('[role="separator"]');
    const list = group.querySelector('ul');
    expect(rule).not.toBeNull();
    // Above the notes, not below them: a rule under the list would close the group off
    // from the next card, which the card's own edge already does.
    expect(rule?.compareDocumentPosition(list as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('sets the grouping line as a caption over the list rather than a sentence in it', async () => {
    await screen.findByText('Project Atlas');

    // Uppercased in CSS, not in the string: some screen readers spell out an all-caps
    // literal letter by letter.
    expect(screen.getByText('Grouped by project').style.textTransform).toBe('uppercase');
  });
});
