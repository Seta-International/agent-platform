import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccountDetail } from '../../../src/api/pm-client.ts';
import { AccountDetailPage } from '../../../src/pages/account-detail-page.tsx';

vi.mock('@seta/web-identity', () => ({
  usePermission: () => true,
}));

// Isolates this page test from the real people-search endpoint (Account Manager / recruiter
// name resolution) — same rationale as charter-detail-page.test.tsx / ra-monitoring-page.test.tsx.
vi.mock('../../../src/api/worker-search.ts', () => ({
  useWorkerSource: () => ({
    source: { search: () => Promise.resolve([]), bootstrap: () => Promise.resolve([]) },
    seed: () => Promise.resolve([]),
  }),
}));

const account: AccountDetail = {
  account_id: 'acc-1',
  name: 'Aeris',
  industry: 'Fintech',
  am_worker_id: null,
  version: 3,
  recruiter_worker_ids: [],
};

vi.mock('../../../src/api/pm-client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/pm-client.ts')>();
  return {
    ...actual,
    fetchAccount: () => Promise.resolve(account),
  };
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AccountDetailPage accountId="acc-1" />
    </QueryClientProvider>,
  );
}

describe('AccountDetailPage — breadcrumb trail (back-link → crumb parity, Astryx migration)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Parity gate: the parent "Accounts" crumb's href must be exactly /pm/accounts — the sole
  // path back to the accounts list.
  it('renders the full trail with the parent crumb carrying the old back-link href', async () => {
    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Aeris' });

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const rootCrumb = within(nav).getByRole('link', { name: 'Project Monitoring' });
    expect(rootCrumb).toHaveAttribute('href', '/pm');

    const parentCrumb = within(nav).getByRole('link', { name: 'Accounts' });
    expect(parentCrumb).toHaveAttribute('href', '/pm/accounts');

    // Current (terminal) crumb is the account name, not a link.
    expect(within(nav).getByText('Aeris').closest('a')).toBeNull();
  });
});
