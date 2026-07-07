import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const closeRequisition = vi.fn();
vi.mock('../../src/api/hiring-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/hiring-client.ts')>()),
  closeRequisition: (id: string, input: unknown) => closeRequisition(id, input),
}));

import { MarkFilledDialog } from '../../src/pages/mark-filled-dialog.tsx';

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

describe('MarkFilledDialog', () => {
  it('confirms by calling closeRequisition with status filled and no reason', async () => {
    closeRequisition.mockResolvedValueOnce({ version: 2 });
    const onDone = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MarkFilledDialog
        requisitionId="req1"
        version={1}
        open
        onOpenChange={() => {}}
        onDone={onDone}
      />,
      { wrapper: wrap(qc) },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Mark filled' }));
    await waitFor(() =>
      expect(closeRequisition).toHaveBeenCalledWith('req1', {
        expected_version: 1,
        status: 'filled',
      }),
    );
    // onDone is deferred ~250ms past the dialog's exit animation (see mark-filled-dialog.tsx).
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});
