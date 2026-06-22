import { createFileRoute } from '@tanstack/react-router';
import { RequestsPage, type RequestsSearch } from '../../pages/requests-page.tsx';

const STATUSES = ['submitted', 'pmo_approved', 'approved', 'rejected', 'withdrawn'] as const;
const SORTS = ['submitted', 'name', 'budget', 'team'] as const;

export const Route = createFileRoute('/_authed/pm/requests/')({
  validateSearch: (s: Record<string, unknown>): RequestsSearch => ({
    view: s.view === 'table' ? 'table' : 'cards',
    status: STATUSES.includes(s.status as never)
      ? (s.status as RequestsSearch['status'])
      : undefined,
    account: typeof s.account === 'string' && s.account ? s.account : undefined,
    q: typeof s.q === 'string' && s.q ? s.q : undefined,
    sort: SORTS.includes(s.sort as never) ? (s.sort as RequestsSearch['sort']) : 'submitted',
    dir: s.dir === 'asc' ? 'asc' : 'desc',
    page: Number.isFinite(Number(s.page)) && Number(s.page) > 0 ? Math.floor(Number(s.page)) : 1,
  }),
  component: RequestsPage,
});
