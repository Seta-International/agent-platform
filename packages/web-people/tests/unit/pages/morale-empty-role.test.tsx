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
        tag: 'tl',
        candidates: [{ person_id: 'p-1', full_name: 'Lead One', context: 'Project A' }],
        unavailable_reason: null,
      },
    ],
  }),
  submitMorale: (...args: unknown[]) => mockSubmit(...args),
}));

/**
 * The field's own error text, ignoring the copy Astryx mirrors into its aria-live region.
 * That mirror keeps the last announcement after the field clears, so matching on the text
 * alone would report an error that is no longer on screen.
 */
function visibleEmptyRoleErrors() {
  return screen
    .queryAllByText('Please select a team leader to include them.')
    .filter((el) => !el.closest('[aria-live]'));
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MoralePage />
    </QueryClientProvider>,
  );
}

describe('Morale role ticked with nobody selected', () => {
  it('blocks Submit and says which pick is missing', async () => {
    const user = userEvent.setup();
    renderPage();

    const role = await screen.findByRole('checkbox', { name: 'Team Leader' });
    await user.click(screen.getByRole('button', { name: 'Neutral' }));
    // Rating alone is enough to submit — the block below has to come from the empty role.
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();

    await user.click(role);

    expect(visibleEmptyRoleErrors()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  it('lets the note through once someone is picked', async () => {
    const user = userEvent.setup();
    renderPage();

    const role = await screen.findByRole('checkbox', { name: 'Team Leader' });
    await user.click(screen.getByRole('button', { name: 'Neutral' }));
    await user.click(role);

    await user.click(screen.getByText('Select recipients...'));
    await user.click(await screen.findByRole('option', { name: /Lead One/ }));

    await waitFor(() => expect(visibleEmptyRoleErrors()).toHaveLength(0));
    const submit = screen.getByRole('button', { name: 'Submit' });
    expect(submit).toBeEnabled();

    await user.click(submit);
    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ recipient_person_ids: ['p-1'] }),
      ),
    );
  });

  it('stops validating a role the sender unticks', async () => {
    const user = userEvent.setup();
    renderPage();

    const role = await screen.findByRole('checkbox', { name: 'Team Leader' });
    await user.click(screen.getByRole('button', { name: 'Neutral' }));
    await user.click(role);
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

    await user.click(role);
    // The picker itself is gone, so there is nothing left to validate. (The message
    // survives in Astryx's aria-live region by design — assert on the field, not the text.)
    expect(
      screen.queryByRole('combobox', { name: 'Team Leader recipients' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
  });
});
