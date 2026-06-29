import { createFileRoute } from '@tanstack/react-router';
import { RA_SORTS, RaMonitoringPage, type RaSearch } from '../../pages/ra-monitoring-page.tsx';

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

export const Route = createFileRoute('/_authed/pm/resourcing/')({
  validateSearch: (s: Record<string, unknown>): RaSearch => ({
    q: str(s.q),
    account: str(s.account),
    project: str(s.project),
    from: str(s.from),
    to: str(s.to),
    sort: RA_SORTS.includes(s.sort as never) ? (s.sort as RaSearch['sort']) : undefined,
    dir: s.dir === 'asc' ? 'asc' : s.dir === 'desc' ? 'desc' : undefined,
  }),
  component: RaMonitoringPage,
});
