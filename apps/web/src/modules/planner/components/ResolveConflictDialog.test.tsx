import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ResolveConflictDialog } from './ResolveConflictDialog';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

const GROUP_ID = 'g1';
const CONFLICT_FIELDS = [
  { field: 'name', localValue: 'Engineering', remoteValue: 'Eng M365' },
  { field: 'description', localValue: 'Local desc', remoteValue: 'Remote desc' },
];

describe('ResolveConflictDialog', () => {
  it('renders conflict fields with radio options', () => {
    wrap(
      <ResolveConflictDialog
        groupId={GROUP_ID}
        conflictFields={CONFLICT_FIELDS}
        open
        onOpenChange={() => {}}
      />,
    );
    expect(screen.getByText('Resolve sync conflict')).toBeInTheDocument();
    // Accessible name of each radio button is computed by the label text
    expect(screen.getByRole('radio', { name: /Keep local.*Engineering/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Use remote.*Eng M365/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Keep local.*Local desc/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Use remote.*Remote desc/ })).toBeInTheDocument();
  });

  it('Resolve button is disabled until all fields have a decision', async () => {
    const user = userEvent.setup();
    wrap(
      <ResolveConflictDialog
        groupId={GROUP_ID}
        conflictFields={CONFLICT_FIELDS}
        open
        onOpenChange={() => {}}
      />,
    );
    const resolveBtn = screen.getByRole('button', { name: 'Resolve' });
    expect(resolveBtn).toBeDisabled();

    // Pick one field only
    await user.click(screen.getByRole('radio', { name: /Keep local.*Engineering/ }));
    expect(resolveBtn).toBeDisabled();

    // Pick the second field
    await user.click(screen.getByRole('radio', { name: /Use remote.*Remote desc/ }));
    expect(resolveBtn).not.toBeDisabled();
  });

  it('submitting calls resolveGroupConflict with correct decisions', async () => {
    const user = userEvent.setup();
    const captured: unknown[] = [];
    server.use(
      http.post(`*/api/integrations/m365/groups/${GROUP_ID}/resolve`, async ({ request }) => {
        captured.push(await request.json());
        return HttpResponse.json({ ok: true });
      }),
    );
    const onOpenChange = vi.fn();
    const onResolved = vi.fn();
    wrap(
      <ResolveConflictDialog
        groupId={GROUP_ID}
        conflictFields={CONFLICT_FIELDS}
        open
        onOpenChange={onOpenChange}
        onResolved={onResolved}
      />,
    );
    await user.click(screen.getByRole('radio', { name: /Keep local.*Engineering/ }));
    await user.click(screen.getByRole('radio', { name: /Use remote.*Remote desc/ }));
    await user.click(screen.getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(captured.length).toBe(1));
    expect(captured[0]).toMatchObject({
      decisions: expect.arrayContaining([
        { field: 'name', choice: 'local' },
        { field: 'description', choice: 'remote' },
      ]),
    });
    await waitFor(() => expect(onResolved).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('dialog closes on success', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`*/api/integrations/m365/groups/${GROUP_ID}/resolve`, () =>
        HttpResponse.json({ ok: true }),
      ),
    );
    const onOpenChange = vi.fn();
    wrap(
      <ResolveConflictDialog
        groupId={GROUP_ID}
        conflictFields={[{ field: 'name', localValue: 'Local', remoteValue: 'Remote' }]}
        open
        onOpenChange={onOpenChange}
      />,
    );
    await user.click(screen.getByRole('radio', { name: /Keep local.*Local/ }));
    await user.click(screen.getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('shows error alert when resolve mutation fails', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`*/api/integrations/m365/groups/${GROUP_ID}/resolve`, () =>
        HttpResponse.json({ error: 'CONFLICT_STALE' }, { status: 409 }),
      ),
    );
    wrap(
      <ResolveConflictDialog
        groupId={GROUP_ID}
        conflictFields={[{ field: 'name', localValue: 'Local', remoteValue: 'Remote' }]}
        open
        onOpenChange={() => {}}
      />,
    );
    await user.click(screen.getByRole('radio', { name: /Keep local.*Local/ }));
    await user.click(screen.getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
