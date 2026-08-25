import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MoralePage } from '../../../src/pages/morale-page.tsx';

// The page links to the history route; the router itself is irrelevant here.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

const fetchMoraleRecipients = vi.fn();
const fetchMoraleInbox = vi.fn();
const fetchMoraleInboxFilters = vi.fn();

vi.mock('../../../src/api/people-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/api/people-client.ts')>()),
  fetchMoraleRecipients: (...args: unknown[]) => fetchMoraleRecipients(...args),
  fetchMoraleInbox: (...args: unknown[]) => fetchMoraleInbox(...args),
  fetchMoraleInboxFilters: (...args: unknown[]) => fetchMoraleInboxFilters(...args),
}));

// Astryx tabs are buttons carrying `aria-current="page"`, not ARIA `tab`s.
const tab = (name: string | RegExp) => screen.getByRole('button', { name });
const findTab = (name: string | RegExp) => screen.findByRole('button', { name });
const queryTab = (name: string | RegExp) => screen.queryByRole('button', { name });

function renderPage(props: Parameters<typeof MoralePage>[0] = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MoralePage {...props} />
    </QueryClientProvider>,
  );
}

describe('Morale tabs (FUT-786)', () => {
  it('hides the manager tabs from someone who can never receive a note', async () => {
    fetchMoraleRecipients.mockResolvedValue({
      can_submit: true,
      can_review: false,
      groups: [],
    });

    renderPage();

    expect(await findTab('Send Notes')).toBeInTheDocument();
    expect(queryTab(/Notes Received/)).not.toBeInTheDocument();
    expect(queryTab('Morale Trend')).not.toBeInTheDocument();
    // The inbox must not even be requested for someone with no capacity to read it.
    expect(fetchMoraleInbox).not.toHaveBeenCalled();
  });

  it('shows the manager tabs, with a badge for the notes still waiting', async () => {
    fetchMoraleRecipients.mockResolvedValue({
      can_submit: false,
      can_review: true,
      groups: [],
    });
    fetchMoraleInbox.mockResolvedValue({ total_notes: 3, unread_notes: 3, projects: [] });
    fetchMoraleInboxFilters.mockResolvedValue({ projects: [], senders: [] });

    renderPage();

    await findTab(/Notes Received/);
    // The badge arrives with the inbox count, a moment after the strip itself.
    await waitFor(() => expect(tab(/Notes Received/)).toHaveTextContent('3'));
    expect(tab('Morale Trend')).toBeInTheDocument();
  });

  it('falls back to Send Notes when a bookmarked tab is no longer permitted', async () => {
    fetchMoraleRecipients.mockResolvedValue({
      can_submit: true,
      can_review: false,
      groups: [],
    });

    renderPage({ tab: 'received' });

    expect(await findTab('Send Notes')).toHaveAttribute('aria-current', 'page');
  });

  it('reports a tab change to the route rather than owning the state itself', async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    fetchMoraleRecipients.mockResolvedValue({
      can_submit: true,
      can_review: true,
      groups: [],
    });
    fetchMoraleInbox.mockResolvedValue({ total_notes: 0, unread_notes: 0, projects: [] });
    fetchMoraleInboxFilters.mockResolvedValue({ projects: [], senders: [] });

    renderPage({ tab: 'send', onTabChange });

    await user.click(await findTab('Morale Trend'));

    expect(onTabChange).toHaveBeenCalledWith('trend');
  });
});
