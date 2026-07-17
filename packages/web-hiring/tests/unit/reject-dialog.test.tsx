import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rejectApplication = vi.fn();
vi.mock('../../src/api/hiring-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/hiring-client.ts')>()),
  rejectApplication: (id: string, input: unknown) => rejectApplication(id, input),
}));

import { RejectDialog } from '../../src/pages/reject-dialog.tsx';

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

describe('RejectDialog', () => {
  beforeEach(() => rejectApplication.mockReset());

  it('rejects with the typed reason', async () => {
    rejectApplication.mockResolvedValueOnce({ version: 2 });
    const onDone = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <RejectDialog applicationId="a1" version={1} open onOpenChange={() => {}} onDone={onDone} />,
      { wrapper: wrap(qc) },
    );

    await userEvent.type(screen.getByLabelText(/reason/i), 'Not enough React depth');
    await userEvent.click(screen.getByRole('button', { name: /^reject$/i }));

    await waitFor(() =>
      expect(rejectApplication).toHaveBeenCalledWith('a1', {
        expected_version: 1,
        reason: 'Not enough React depth',
      }),
    );
    expect(onDone).toHaveBeenCalled();
  });

  it('blocks rejecting without a reason and marks the field', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <RejectDialog
        applicationId="a1"
        version={1}
        open
        onOpenChange={() => {}}
        onDone={() => {}}
      />,
      { wrapper: wrap(qc) },
    );

    await userEvent.click(screen.getByRole('button', { name: /^reject$/i }));

    expect(screen.getByText('Reason is required.')).toBeInTheDocument();
    expect(rejectApplication).not.toHaveBeenCalled();
  });
});
