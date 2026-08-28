import { createFileRoute } from '@tanstack/react-router';
import { KpiMetricsPage, type KpiMetricsSearch } from '../../pages/kpi-metrics-page.tsx';

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
};

/** The Account filter takes several accounts, kept as `?accounts=a,b` so the URL stays readable
 * enough to paste to someone. A link written before it did — `?account=a` — still resolves, to
 * that one account. */
const accounts = (s: Record<string, unknown>): string | undefined => {
  const raw = Array.isArray(s.accounts)
    ? s.accounts.join(',')
    : (str(s.accounts) ?? str(s.account));
  const ids = (raw ?? '').split(',').flatMap((id) => (id.trim() ? [id.trim()] : []));
  return ids.length ? ids.join(',') : undefined;
};

export const Route = createFileRoute('/_authed/pm/metrics/')({
  validateSearch: (s: Record<string, unknown>): KpiMetricsSearch => ({
    tab: s.tab === 'norm' ? 'norm' : s.tab === 'explorer' ? 'explorer' : undefined,
    accounts: accounts(s),
    project: str(s.project),
    iso_year: num(s.iso_year),
    iso_week: num(s.iso_week),
    detail: str(s.detail),
  }),
  component: KpiMetricsPage,
});
