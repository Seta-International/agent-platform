import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateWorkerDialog } from '../../../src/components/create-worker-dialog';

vi.mock('../../../src/api/org-client.ts', () => ({
  fetchOrgStructure: vi.fn().mockResolvedValue({ units: [] }),
}));

const mockCreateWorker = vi.fn().mockResolvedValue({ worker_id: 'w-1' });

vi.mock('../../../src/api/people-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/api/people-client.ts')>()),
  createWorker: (...args: unknown[]) => mockCreateWorker(...args),
}));

function renderDialog(onCreated = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <CreateWorkerDialog onCreated={onCreated} />
    </QueryClientProvider>,
  );
  return { onCreated };
}

describe('CreateWorkerDialog', () => {
  beforeEach(() => {
    mockCreateWorker.mockClear();
  });

  it('is closed until the trigger is clicked, then opens as an accessible dialog', async () => {
    const user = userEvent.setup();
    renderDialog();

    // Astryx `Dialog` always mounts its children — the native <dialog> just has no
    // `open` attribute (and thus no dialog role) until isOpen flips true.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'New worker' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Add worker' })).toBeInTheDocument();
  });

  it('creates a worker from the filled-in name and closes the dialog', async () => {
    const user = userEvent.setup();
    const { onCreated } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'New worker' }));
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText(/^Full name/), 'Ada Lovelace');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await vi.waitFor(() => {
      expect(mockCreateWorker).toHaveBeenCalledWith(
        expect.objectContaining({ full_name: 'Ada Lovelace' }),
      );
    });
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalled());
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('cancel closes the dialog without creating a worker', async () => {
    const user = userEvent.setup();
    const { onCreated } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'New worker' }));
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText(/^Full name/), 'Grace Hopper');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockCreateWorker).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('disables Create while the name is empty', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'New worker' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled();
  });
});
