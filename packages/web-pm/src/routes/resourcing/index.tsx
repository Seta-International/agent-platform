import { createFileRoute } from '@tanstack/react-router';
import { RaMonitoringPage, type RaSearch } from '../../pages/ra-monitoring-page.tsx';

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

export const Route = createFileRoute('/_authed/pm/resourcing/')({
  validateSearch: (s: Record<string, unknown>): RaSearch => ({
    q: str(s.q),
    account: str(s.account),
    project: str(s.project),
    from: str(s.from),
    to: str(s.to),
  }),
  component: RaMonitoringPage,
});
