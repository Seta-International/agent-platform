import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { PerformanceStrategicDashboard } from '../../../src/components/performance-strategic-dashboard.tsx';

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

describe('PerformanceStrategicDashboard', () => {
  it('renders the org home without the unlock panel', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<PerformanceStrategicDashboard month="2026-08" />, { wrapper: wrap(qc) });
    expect(screen.getByTestId('performance-home')).toBeInTheDocument();
  });
});
