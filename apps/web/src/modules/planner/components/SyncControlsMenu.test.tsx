import { DropdownMenu, DropdownMenuContent } from '@seta/shared-ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SyncControlsMenu } from './SyncControlsMenu';

const server = setupServer(
  http.post('*/api/integrations/m365/groups/*/refresh', () => HttpResponse.json({ ok: true })),
  http.post('*/api/integrations/m365/groups/*/unlink', () => HttpResponse.json({ id: 'g1' })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <DropdownMenu open>
        <DropdownMenuContent>{node}</DropdownMenuContent>
      </DropdownMenu>
    </QueryClientProvider>,
  );
}

describe('SyncControlsMenu', () => {
  it('native + canManage shows "Link to M365…" only', () => {
    wrap(
      <SyncControlsMenu
        groupId="g1"
        externalSource="native"
        syncStatus={null}
        canManage
        onLinkClick={vi.fn()}
        onResolveClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Link to M365…')).toBeInTheDocument();
    expect(screen.queryByText('Refresh sync')).not.toBeInTheDocument();
    expect(screen.queryByText('Unlink from M365')).not.toBeInTheDocument();
  });

  it('m365 + canManage shows Refresh and Unlink items', () => {
    wrap(
      <SyncControlsMenu
        groupId="g1"
        externalSource="m365"
        syncStatus={null}
        canManage
        onLinkClick={vi.fn()}
        onResolveClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Refresh sync')).toBeInTheDocument();
    expect(screen.getByText('Unlink from M365')).toBeInTheDocument();
    expect(screen.queryByText('Link to M365…')).not.toBeInTheDocument();
  });

  it('m365 + canManage + conflict status shows Resolve conflict item', () => {
    wrap(
      <SyncControlsMenu
        groupId="g1"
        externalSource="m365"
        syncStatus="conflict"
        canManage
        onLinkClick={vi.fn()}
        onResolveClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Refresh sync')).toBeInTheDocument();
    expect(screen.getByText('Unlink from M365')).toBeInTheDocument();
    expect(screen.getByText('Resolve conflict…')).toBeInTheDocument();
  });

  it('m365 + canManage=false still shows Refresh sync (any member may refresh)', () => {
    wrap(
      <SyncControlsMenu
        groupId="g1"
        externalSource="m365"
        syncStatus={null}
        canManage={false}
        onLinkClick={vi.fn()}
        onResolveClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Refresh sync')).toBeInTheDocument();
    expect(screen.queryByText('Unlink from M365')).not.toBeInTheDocument();
    expect(screen.queryByText('Link to M365…')).not.toBeInTheDocument();
  });

  it('clicking "Refresh sync" fires the mutation', async () => {
    const user = userEvent.setup();
    let refreshCalled = false;
    server.use(
      http.post('*/api/integrations/m365/groups/g1/refresh', () => {
        refreshCalled = true;
        return HttpResponse.json({ ok: true });
      }),
    );
    wrap(
      <SyncControlsMenu
        groupId="g1"
        externalSource="m365"
        syncStatus={null}
        canManage
        onLinkClick={vi.fn()}
        onResolveClick={vi.fn()}
      />,
    );
    await user.click(screen.getByText('Refresh sync'));
    await waitFor(() => expect(refreshCalled).toBe(true));
  });

  it('clicking "Link to M365…" calls onLinkClick', async () => {
    const user = userEvent.setup();
    const onLinkClick = vi.fn();
    wrap(
      <SyncControlsMenu
        groupId="g1"
        externalSource="native"
        syncStatus={null}
        canManage
        onLinkClick={onLinkClick}
        onResolveClick={vi.fn()}
      />,
    );
    await user.click(screen.getByText('Link to M365…'));
    expect(onLinkClick).toHaveBeenCalled();
  });
});
