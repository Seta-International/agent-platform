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

const mockSubmit = vi.fn().mockResolvedValue({ note_id: 'n-1' });

vi.mock('../../../src/api/people-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/api/people-client.ts')>()),
  fetchMoraleRecipients: vi.fn().mockResolvedValue({
    can_submit: true,
    groups: [
      {
        tag: 'bod',
        candidates: [
          { person_id: 'p-1', full_name: 'Board Member One', context: null },
          { person_id: 'p-2', full_name: 'Board Member Two', context: null },
        ],
        unavailable_reason: null,
      },
    ],
  }),
  submitMorale: (...args: unknown[]) => mockSubmit(...args),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MoralePage />
    </QueryClientProvider>,
  );
}

describe('Morale submit form reset', () => {
  it('unticks the role checkboxes after a successful submit', async () => {
    const user = userEvent.setup();
    renderPage();

    const role = await screen.findByRole('checkbox', { name: 'Board of Directors' });
    await user.click(role);
    expect(role).toBeChecked();

    // A ticked role with nobody picked blocks Submit, so choose someone first.
    await user.click(screen.getByText('Select recipients...'));
    await user.click(await screen.findByRole('option', { name: /Board Member One/ }));

    await user.click(screen.getByRole('button', { name: 'Neutral' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());

    // The regression: the role checkbox kept its tick because `open` lived in local
    // state seeded from props, so clearing the parent's selection never reached it.
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Board of Directors' })).not.toBeChecked(),
    );
    // HR is locked on every note, so it stays ticked by design.
    expect(screen.getByRole('checkbox', { name: 'HR' })).toBeChecked();
  });
});
