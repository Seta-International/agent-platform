import { FileInput } from '@seta/shared-ui';
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

// Astryx's FieldLabel applies sr-only styling to `description` too whenever
// `isLabelHidden` is set on the field (see @astryxdesign/core FieldLabel.tsx) — the
// original regression this suite must catch. Plain `getByText` can't see that: it only
// asserts DOM presence, not the sr-only clip/1px-box treatment StyleX layers on top.
// Derive the exact "sr-only extra" class signature at test time (rather than hardcoding
// StyleX's atomic hashes) by diffing a known-hidden field's description classes against
// a known-visible one, then assert the real hint carries none of them.
function srOnlyExtraClasses(): Set<string> {
  const { container: hidden } = render(
    <FileInput
      label="probe"
      isLabelHidden
      description="probe-description"
      value={null}
      onChange={() => {}}
    />,
  );
  const { container: visible } = render(
    <FileInput label="probe" description="probe-description" value={null} onChange={() => {}} />,
  );
  const hiddenDesc = Array.from(hidden.querySelectorAll('span')).find(
    (el) => el.textContent === 'probe-description',
  );
  const visibleDesc = Array.from(visible.querySelectorAll('span')).find(
    (el) => el.textContent === 'probe-description',
  );
  const hiddenSet = new Set((hiddenDesc?.className ?? '').split(' '));
  const visibleSet = new Set((visibleDesc?.className ?? '').split(' '));
  return new Set([...hiddenSet].filter((c) => !visibleSet.has(c)));
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
    await user.click(within(dialog).getByRole('button', { name: 'Create worker' }));

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

  it('renders the CV upload label and format hint visibly, not screen-reader-only', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'New worker' }));
    const dialog = await screen.findByRole('dialog');

    const label = within(dialog).getByText('Upload CV to auto-fill', { selector: 'label' });
    const hint = within(dialog).getByText(/PDF or DOCX, up to 10MB/);
    const extra = srOnlyExtraClasses();
    expect(extra.size).toBeGreaterThan(0); // sanity: the probe actually detects a difference

    const labelClasses = new Set(label.className.split(' '));
    const hintClasses = new Set(hint.className.split(' '));
    expect([...extra].filter((c) => labelClasses.has(c))).toEqual([]);
    expect([...extra].filter((c) => hintClasses.has(c))).toEqual([]);
  });

  it('disables Create while the name is empty', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'New worker' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByRole('button', { name: 'Create worker' })).toBeDisabled();
  });
});
