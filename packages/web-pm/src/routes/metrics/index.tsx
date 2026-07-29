import { createFileRoute } from '@tanstack/react-router';
import type { KpiMetricsSearch } from '../../pages/kpi-metrics-page.tsx';
import { PmComingSoon } from '../../pages/pm-coming-soon.tsx';

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
};

function KpiMetricsPlaceholder() {
  return (
    <PmComingSoon title="KPI Metrics" description="KPI dashboards and metrics will appear here." />
  );
}

export const Route = createFileRoute('/_authed/pm/metrics/')({
  validateSearch: (s: Record<string, unknown>): KpiMetricsSearch => ({
    tab: s.tab === 'norm' ? 'norm' : s.tab === 'explorer' ? 'explorer' : undefined,
    account: str(s.account),
    project: str(s.project),
    iso_year: num(s.iso_year),
    iso_week: num(s.iso_week),
  }),
  component: KpiMetricsPlaceholder,
});
