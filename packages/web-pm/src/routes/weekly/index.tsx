import { createFileRoute } from '@tanstack/react-router';
import { WeeklyReportsPage, type WeeklyReportsSearch } from '../../pages/weekly-reports-page.tsx';

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
};

export const Route = createFileRoute('/_authed/pm/weekly/')({
  validateSearch: (s: Record<string, unknown>): WeeklyReportsSearch => ({
    account: str(s.account),
    project: str(s.project),
    iso_year: num(s.iso_year),
    iso_week: num(s.iso_week),
    detail: str(s.detail),
  }),
  component: WeeklyReportsPage,
});
