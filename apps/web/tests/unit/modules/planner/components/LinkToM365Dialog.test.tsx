import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LinkToM365Dialog } from '../../../../../src/modules/planner/components/LinkToM365Dialog';

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

const FAKE_M365_GROUPS = [
  { external_id: 'ext-1', display_name: 'Engineering M365', mail_nickname: 'engineering' },
  { external_id: 'ext-2', display_name: 'Product Team', mail_nickname: 'product' },
];

describe('LinkToM365Dialog', () => {
  it('renders with title and search input', () => {
    wrap(<LinkToM365Dialog groupId={GROUP_ID} open onOpenChange={() => {}} />);
    expect(screen.getByText('Link with a Microsoft 365 group')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search Microsoft 365 groups…')).toBeInTheDocument();
  });

  it('typing in search triggers searchM365Groups call', async () => {
    const user = userEvent.setup();
    let searched = false;
    server.use(
      http.get('*/api/integrations/m365/groups/search', ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('q')) {
          searched = true;
        }
        return HttpResponse.json({ groups: FAKE_M365_GROUPS });
      }),
    );
    wrap(<LinkToM365Dialog groupId={GROUP_ID} open onOpenChange={() => {}} />);
    await user.type(screen.getByPlaceholderText('Search Microsoft 365 groups…'), 'Eng');
    await waitFor(() => expect(searched).toBe(true));
    await waitFor(() => expect(screen.getByText('Engineering M365')).toBeInTheDocument());
    expect(screen.getByText('engineering')).toBeInTheDocument();
  });

  it('selecting a result and clicking "Link group" calls linkGroupToM365', async () => {
    const user = userEvent.setup();
    const captured: unknown[] = [];
    server.use(
      http.get('*/api/integrations/m365/groups/search', () =>
        HttpResponse.json({ groups: FAKE_M365_GROUPS }),
      ),
      http.post(`*/api/integrations/m365/groups/${GROUP_ID}/link`, async ({ request }) => {
        captured.push(await request.json());
        return HttpResponse.json({ id: GROUP_ID });
      }),
    );
    const onOpenChange = vi.fn();
    wrap(<LinkToM365Dialog groupId={GROUP_ID} open onOpenChange={onOpenChange} />);
    await user.type(screen.getByPlaceholderText('Search Microsoft 365 groups…'), 'Eng');
    await waitFor(() => expect(screen.getByText('Engineering M365')).toBeInTheDocument());
    await user.click(screen.getByText('Engineering M365'));
    await user.click(screen.getByRole('button', { name: 'Link' }));
    await waitFor(() => expect(captured.length).toBe(1));
    expect(captured[0]).toMatchObject({ external_id: 'ext-1' });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('LINKED_DUPLICATE error shows in error alert', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/integrations/m365/groups/search', () =>
        HttpResponse.json({ groups: FAKE_M365_GROUPS }),
      ),
      http.post(`*/api/integrations/m365/groups/${GROUP_ID}/link`, () =>
        HttpResponse.json({ error: 'LINKED_DUPLICATE' }, { status: 409 }),
      ),
    );
    wrap(<LinkToM365Dialog groupId={GROUP_ID} open onOpenChange={() => {}} />);
    await user.type(screen.getByPlaceholderText('Search Microsoft 365 groups…'), 'Eng');
    await waitFor(() => expect(screen.getByText('Engineering M365')).toBeInTheDocument());
    await user.click(screen.getByText('Engineering M365'));
    await user.click(screen.getByRole('button', { name: 'Link' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('Cancel button clears search and selection state', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/integrations/m365/groups/search*', () =>
        HttpResponse.json({
          groups: [{ external_id: 'ext1', display_name: 'Eng', mail_nickname: 'eng' }],
        }),
      ),
    );
    const onOpenChange = vi.fn();
    wrap(<LinkToM365Dialog groupId={GROUP_ID} open onOpenChange={onOpenChange} />);
    await user.type(screen.getByPlaceholderText('Search Microsoft 365 groups…'), 'eng');
    await screen.findByText('Eng');
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
