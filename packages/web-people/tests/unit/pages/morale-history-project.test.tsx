import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { MoraleNoteView } from '../../../src/api/people-client.ts';
import { MoraleHistoryPage } from '../../../src/pages/morale-history-page.tsx';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

/** Same instant on every note, so the project line is the only thing that varies. */
const SUBMITTED_AT = '2026-08-18T03:00:00.000Z';

function note(id: string, project: Pick<MoraleNoteView, 'project_id' | 'project_name'>) {
  return {
    id,
    rating: 4,
    concern_text: `Note ${id}`,
    submitted_at: SUBMITTED_AT,
    recipients: [{ recipient_tag: 'pmo' as const, full_name_snapshot: 'Pat Ellis' }],
    ...project,
  } satisfies MoraleNoteView;
}

const NOTES: MoraleNoteView[] = [
  note('named', {
    project_id: '11111111-1111-4111-8111-111111111111',
    project_name: 'Acme Billing Revamp',
  }),
  // A sender on no project at all — an HR or BoD manager.
  note('projectless', { project_id: null, project_name: null }),
  // Filed against a project the projection has since dropped.
  note('orphaned', {
    project_id: '22222222-2222-4222-8222-222222222222',
    project_name: null,
  }),
];

vi.mock('../../../src/api/people-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/api/people-client.ts')>()),
  fetchMoraleHistory: vi.fn(async () => ({ notes: NOTES })),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MoraleHistoryPage />
    </QueryClientProvider>,
  );
}

describe('Morale history project label', () => {
  it('names the project beside the timestamp', async () => {
    renderPage();

    const label = await screen.findByText('Acme Billing Revamp');
    expect(label).toBeInTheDocument();

    // Beside the timestamp rather than anywhere on the card: the two have to read as one
    // line, which is the whole point of putting the project here.
    const row = label.closest('div')?.parentElement;
    expect(row?.textContent).toContain('18/08/2026');
    expect(row?.textContent).toContain('Acme Billing Revamp');
  });

  it('says nothing for a note filed against no project', async () => {
    renderPage();

    await screen.findByText('Note projectless');
    // Every note here shares a timestamp, so counting the rendered timestamps proves the
    // projectless note is on screen while carrying no project label of its own.
    expect(screen.getAllByText(/18\/08\/2026/)).toHaveLength(NOTES.length);
    expect(screen.queryByText('Unknown project')).not.toBeNull();
  });

  it('marks a project it can no longer name rather than reading as project-less', async () => {
    renderPage();

    // The orphaned note has an id but no name. Falling back to a blank would make it
    // indistinguishable from the genuinely project-less note above.
    expect(await screen.findByText('Unknown project')).toBeInTheDocument();
    expect(screen.getAllByText('Unknown project')).toHaveLength(1);
  });
});
