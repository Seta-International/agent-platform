import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const transferApplication = vi.fn();
vi.mock('../../src/api/hiring-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/hiring-client.ts')>()),
  transferApplication: (id: string, input: unknown) => transferApplication(id, input),
  fetchRequisitions: () =>
    Promise.resolve([
      { id: 'r1', title: 'Backend Eng', status: 'open' },
      { id: 'r2', title: 'Frontend Eng', status: 'open' },
    ]),
}));

import { TransferDialog } from '../../src/pages/transfer-dialog.tsx';

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

describe('TransferDialog', () => {
  it('excludes the current role and transfers to the chosen target', async () => {
    transferApplication.mockResolvedValueOnce({ to_application_id: 'a2', version: 1 });
    const onDone = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <TransferDialog
        applicationId="a1"
        version={3}
        currentRequisitionId="r1"
        open
        onOpenChange={() => {}}
        onDone={onDone}
      />,
      { wrapper: wrap(qc) },
    );
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Frontend Eng' })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('option', { name: 'Backend Eng' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /move candidate/i }));
    await waitFor(() =>
      expect(transferApplication).toHaveBeenCalledWith('a1', {
        expected_version: 3,
        target_requisition_id: 'r2',
      }),
    );
    expect(onDone).toHaveBeenCalled();
  });
});
