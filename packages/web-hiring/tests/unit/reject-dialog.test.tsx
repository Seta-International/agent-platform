import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const rejectApplication = vi.fn();
vi.mock('../../src/api/hiring-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/hiring-client.ts')>()),
  rejectApplication: (id: string, input: unknown) => rejectApplication(id, input),
  fetchRejectionReasons: () =>
    Promise.resolve([
      { id: 'rr1', label: 'Lacking skills', category: 'rejected_by_us', active: true, version: 1 },
    ]),
}));

import { RejectDialog } from '../../src/pages/reject-dialog.tsx';

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

describe('RejectDialog', () => {
  it('rejects with the chosen reason and parsed tags', async () => {
    rejectApplication.mockResolvedValueOnce({ version: 2 });
    const onDone = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <RejectDialog applicationId="a1" version={1} open onOpenChange={() => {}} onDone={onDone} />,
      { wrapper: wrap(qc) },
    );
    // Wait for query to load so effectiveReason resolves to rr1 (auto-select first active reason)
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /reason/i })).toBeInTheDocument(),
    );
    // Give the query time to settle so effectiveReason = 'rr1'
    await waitFor(() =>
      expect(qc.getQueryState(['hiring', 'rejection-reasons'])?.status).toBe('success'),
    );
    await userEvent.type(screen.getByLabelText(/tags/i), 'frontend, junior');
    await userEvent.click(screen.getByRole('button', { name: /^reject$/i }));
    await waitFor(() =>
      expect(rejectApplication).toHaveBeenCalledWith('a1', {
        expected_version: 1,
        reason_id: 'rr1',
        tags: ['frontend', 'junior'],
        note: undefined,
      }),
    );
    expect(onDone).toHaveBeenCalled();
  });
});
