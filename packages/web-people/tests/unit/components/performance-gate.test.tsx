import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PerformanceContext } from '../../../src/api/people-client.ts';
import { PerformanceGate } from '../../../src/components/performance-gate.tsx';

const mockFetch = vi.hoisted(() => vi.fn<() => Promise<PerformanceContext>>());
vi.mock('../../../src/api/people-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/api/people-client.ts')>()),
  fetchPerformanceContext: mockFetch,
}));

function renderGate() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PerformanceGate>
        {(ctx) => <div>entered as {ctx.capacities[0]?.label ?? 'none'}</div>}
      </PerformanceGate>
    </QueryClientProvider>,
  );
}

describe('PerformanceGate', () => {
  afterEach(() => mockFetch.mockReset());

  it('renders children with context on ok (AC1)', async () => {
    mockFetch.mockResolvedValue({
      status: 'ok',
      as_of_month: '2026-07',
      person: { person_id: 'p1', full_name: 'Jane', org_unit_id: null },
      role_slugs: [],
      capacities: [{ kind: 'tl', project_id: 'a', account_id: 'x', label: 'Alpha' }],
      default_capacity_index: 0,
    });
    renderGate();
    expect(await screen.findByText('entered as Alpha')).toBeInTheDocument();
  });

  it('shows the dedicated Contact HR block state, not a generic 403 (AC3)', async () => {
    mockFetch.mockResolvedValue({ status: 'no_employee_record' });
    renderGate();
    expect(await screen.findByText('No employee record found')).toBeInTheDocument();
    expect(screen.getByText(/contact HR/i)).toBeInTheDocument();
    expect(screen.queryByText('No access')).not.toBeInTheDocument();
  });

  it('shows error + Retry without internals, and retries (AC2 family)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED 10.0.0.1:5432'));
    mockFetch.mockResolvedValueOnce({ status: 'no_employee_record' });
    renderGate();
    expect(await screen.findByText("Couldn't load your performance workspace")).toBeInTheDocument();
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No employee record found')).toBeInTheDocument();
  });
});
