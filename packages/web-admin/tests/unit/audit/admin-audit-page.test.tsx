import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AdminAudit, type AdminAuditSearch } from '../../../src/audit/pages/AdminAudit.tsx';

// Mirrors the route: holds the URL search state and feeds it to the page so we
// can observe how table interactions rewrite the query params.
function Harness() {
  const [search, setSearch] = useState<AdminAuditSearch>({});
  return <AdminAudit search={search} onSearch={(next) => setSearch((p) => next(p))} />;
}

vi.mock('../../../src/audit/hooks/queries/use-audit-events.ts', () => ({
  useAuditEvents: vi.fn(),
}));

const mockRows = [
  {
    event_id: 'e1',
    occurred_at: '2026-07-16T10:00:00.000Z',
    event_type: 'identity.user.created',
    actor: { user_id: 'u1', email: 'ada@acme.com', kind: 'user' },
    before: null,
    after: { name: 'Ada' },
    trace_id: 'trace-abcdef-123',
  },
  {
    event_id: 'e2',
    occurred_at: '2026-07-16T09:00:00.000Z',
    event_type: 'identity.user.deactivated',
    actor: { user_id: 'u2', email: 'grace@acme.com', kind: 'user' },
    before: { active: true },
    after: { active: false },
    trace_id: null,
  },
];

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

async function setup(data: { rows: typeof mockRows; total: number }, isLoading = false) {
  const mod = await import('../../../src/audit/hooks/queries/use-audit-events.ts');
  const useAuditEvents = mod.useAuditEvents as ReturnType<typeof vi.fn>;
  useAuditEvents.mockReturnValue({ data, isLoading });
  return useAuditEvents;
}

describe('AdminAudit page', () => {
  it('clicking a sort header rewrites the sort query params (mapped callback)', async () => {
    const user = userEvent.setup();
    const useAuditEvents = await setup({ rows: mockRows, total: 2 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Harness />, { wrapper: wrap(qc) });

    const table = screen.getByRole('table');
    await user.click(within(table).getByRole('button', { name: /sort by event/i }));

    // The Astryx sortable→server mapper turns the first sort entry into
    // sort_by/sort_dir; a first click on an unsorted column is ascending.
    await waitFor(() =>
      expect(useAuditEvents).toHaveBeenCalledWith(
        expect.objectContaining({ sort_by: 'event_type', sort_dir: 'asc' }),
      ),
    );
  });

  it('changing page updates the offset via page_index (1-based pager → 0-based state)', async () => {
    const user = userEvent.setup();
    const useAuditEvents = await setup({ rows: mockRows, total: 60 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Harness />, { wrapper: wrap(qc) });

    const pager = screen.getByRole('navigation', { name: /table pagination/i });
    await user.click(within(pager).getByRole('button', { name: /go to page 2/i }));

    // page 2 (1-based) → page_index 1 → offset 25 with the default page size.
    await waitFor(() =>
      expect(useAuditEvents).toHaveBeenCalledWith(expect.objectContaining({ offset: 25 })),
    );
  });

  it('clicking a row opens the payload-diff detail drawer (expansion replacement)', async () => {
    const user = userEvent.setup();
    await setup({ rows: mockRows, total: 2 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Harness />, { wrapper: wrap(qc) });

    const table = screen.getByRole('table');
    await user.click(within(table).getByText('identity.user.created'));

    const drawer = await screen.findByRole('dialog', { name: /event detail/i });
    expect(within(drawer).getByText('Payload diff')).toBeInTheDocument();
    // The panel serializes { before, after } — the after payload is present.
    expect(within(drawer).getByText(/"name": "Ada"/)).toBeInTheDocument();
  });

  it('renders the empty state when there are no events', async () => {
    await setup({ rows: [], total: 0 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Harness />, { wrapper: wrap(qc) });

    // Scope to the table: "No events" also appears in the page header subtitle.
    const table = await screen.findByRole('table');
    expect(within(table).getByText('No events')).toBeInTheDocument();
  });

  it('renders the Admin → Audit log breadcrumb trail with a navigable root crumb', async () => {
    await setup({ rows: mockRows, total: 2 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Harness />, { wrapper: wrap(qc) });

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const rootCrumb = within(nav).getByRole('link', { name: 'Admin' });
    expect(rootCrumb).toHaveAttribute('href', '/admin');
    // The terminal crumb reflects the page but is not itself a link.
    expect(within(nav).getByText('Audit log').closest('a')).toBeNull();

    // The h1 still carries the page's real heading semantics.
    expect(screen.getByRole('heading', { level: 1, name: 'Audit log' })).toBeInTheDocument();
  });

  it('keeps the filter toolbar pinned outside the scrollable content region', async () => {
    await setup({ rows: mockRows, total: 2 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(<Harness />, { wrapper: wrap(qc) });

    const toolbar = screen.getByRole('toolbar', { name: 'Audit log filters' });
    // `.astryx-layout-content` is the Astryx `LayoutContent` component's own stable,
    // documented base class (see `themeProps()` in the vendor package) — not a StyleX
    // atomic-class hash, so it's safe to assert on. The page also nests a second,
    // drawer-scoped `LayoutContent` inside the (always-mounted) payload-diff detail
    // drawer; that one is a descendant of this outer one, so it sorts after it in
    // document order and `querySelector` (which returns the first match) reliably
    // picks the outer, page-level scroll region here.
    const content = container.querySelector('.astryx-layout-content');
    expect(content).not.toBeNull();
    // The toolbar must be pinned in the header, never scrolled away with the table.
    expect(content?.contains(toolbar)).toBe(false);
  });
});
