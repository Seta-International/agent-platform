import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MoralePage } from '../../../src/pages/morale-page.tsx';

// The page links to the history route; the router itself is irrelevant here.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('../../../src/api/people-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/api/people-client.ts')>()),
  // The only answer that still withholds the form: a login with no employee record.
  // Holding no allocation is no longer a bar — an HR or BoD manager gets `can_submit`
  // true with an empty `projects` and the PMO/BoD groups.
  fetchMoraleRecipients: vi.fn().mockResolvedValue({
    can_submit: false,
    projects: [],
    selected_project_id: null,
    groups: [],
  }),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MoralePage />
    </QueryClientProvider>,
  );
}

describe('Morale for a login with no employee record', () => {
  it('explains why instead of rendering the form', async () => {
    renderPage();

    expect(
      await screen.findByText('No employee record is linked to your account'),
    ).toBeInTheDocument();

    // The whole point of the gate: nothing submittable is on screen. Checking the rating
    // scale and the Submit button separately, because a form rendered with everything
    // disabled would still be the wrong answer here.
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Neutral' })).not.toBeInTheDocument();
    expect(screen.queryByText('How are you feeling?')).not.toBeInTheDocument();

    // History goes with the form. Someone who may never submit has no history to read,
    // so leaving the button up would offer a trip to a guaranteed empty page.
    expect(screen.queryByRole('button', { name: 'View history' })).not.toBeInTheDocument();
  });
});
