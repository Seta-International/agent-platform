import { createFileRoute } from '@tanstack/react-router';
import { OrgChartPage, type OrgSearch } from '../pages/org-chart-page.tsx';

export const Route = createFileRoute('/_authed/people/org')({
  validateSearch: (s: Record<string, unknown>): OrgSearch => ({
    view: s.view === 'account' || s.view === 'project' ? s.view : 'company',
    account: typeof s.account === 'string' ? s.account : undefined,
    project: typeof s.project === 'string' ? s.project : undefined,
  }),
  component: OrgChartPage,
});
