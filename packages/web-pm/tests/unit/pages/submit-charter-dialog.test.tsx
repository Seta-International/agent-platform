import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SubmitCharterDialog } from '../../../src/pages/submit-charter-dialog.tsx';

const submitCharter = vi.fn();
vi.mock('../../../src/api/pm-client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/pm-client.ts')>();
  return {
    ...actual,
    fetchAccounts: () =>
      Promise.resolve([
        {
          account_id: 'acc1',
          name: 'Aeris',
          industry: null,
          am_worker_id: null,
          recruiter_count: 0,
          project_count: 0,
        },
      ]),
    submitCharter: (body: unknown) => submitCharter(body),
  };
});

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

// The PM field's Typeahead goes through useWorkerSource -> createHttpEntitySource, which hits
// the real people-search endpoint via global fetch (not pm-client) — mirrors the fetch-mocking
// pattern in project-detail-page.test.tsx for the same endpoint.
function mockWorkerSearch() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/people/v1/workers')) {
      return jsonResponse({ rows: [{ worker_id: 'w1', full_name: 'Jane PM' }] });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

function renderDialog(onCreated = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <SubmitCharterDialog onCreated={onCreated} />
    </QueryClientProvider>,
  );
  return { ...utils, onCreated };
}

describe('SubmitCharterDialog (Astryx migration smoke test)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    submitCharter.mockReset();
  });

  // purpose="form" -> role="dialog". Title asserted via heading within() the dialog, not the
  // dialog's accessible name (Astryx's DialogHeader doesn't wire aria-labelledby).
  it('opens from the New request trigger and closes via Cancel without submitting', async () => {
    mockWorkerSearch();
    const user = userEvent.setup();
    renderDialog();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New request' }));

    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Submit project charter' }),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(submitCharter).not.toHaveBeenCalled();
  });

  it('submits with account/name/PM filled in and closes the dialog on success', async () => {
    mockWorkerSearch();
    submitCharter.mockResolvedValueOnce({ project_id: 'p1' });
    const user = userEvent.setup();
    const { onCreated } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'New request' }));
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('combobox', { name: /^Account/ }));
    await user.click(await screen.findByRole('option', { name: 'Aeris' }));

    await user.type(within(dialog).getByLabelText(/^Project name/), 'Watchtower');

    const pmField = within(dialog).getByLabelText(/^PM/);
    await user.click(pmField);
    await user.type(pmField, 'Jane');
    await user.click(await screen.findByRole('option', { name: 'Jane PM' }));

    await user.click(within(dialog).getByRole('button', { name: 'Submit' }));

    await waitFor(() =>
      expect(submitCharter).toHaveBeenCalledWith(
        expect.objectContaining({
          account_id: 'acc1',
          name: 'Watchtower',
          pm_worker_id: 'w1',
        }),
      ),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
