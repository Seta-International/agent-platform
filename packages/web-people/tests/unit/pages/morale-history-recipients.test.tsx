import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { MoraleNoteView } from '../../../src/api/people-client.ts';
import { MoraleHistoryPage } from '../../../src/pages/morale-history-page.tsx';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

function noteWith(recipientCount: number): MoraleNoteView {
  return {
    id: `note-${recipientCount}`,
    rating: 4,
    concern_text: 'Something worth saying',
    submitted_at: '2026-08-18T03:00:00.000Z',
    recipients: Array.from({ length: recipientCount }, (_, i) => ({
      recipient_tag: 'pmo' as const,
      full_name_snapshot: `Person ${i + 1}`,
    })),
  };
}

const notes = vi.fn<() => MoraleNoteView[]>(() => [noteWith(7)]);

vi.mock('../../../src/api/people-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/api/people-client.ts')>()),
  fetchMoraleHistory: vi.fn(async () => ({ notes: notes() })),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MoraleHistoryPage />
    </QueryClientProvider>,
  );
}

describe('Morale history recipient list', () => {
  it('shows five recipients, the hidden count, and expands on See more', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(/Person 5 · PMO/)).toBeInTheDocument();
    expect(screen.queryByText(/Person 6 · PMO/)).not.toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'See more' }));

    expect(screen.getByText(/Person 6 · PMO/)).toBeInTheDocument();
    expect(screen.getByText(/Person 7 · PMO/)).toBeInTheDocument();
    // The count is redundant once every name is on screen.
    expect(screen.queryByText('+2')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'See less' }));
    expect(screen.queryByText(/Person 6 · PMO/)).not.toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('leaves a note at the cutoff alone', async () => {
    notes.mockReturnValueOnce([noteWith(5)]);
    renderPage();

    expect(await screen.findByText(/Person 5 · PMO/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'See more' })).not.toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });
});
