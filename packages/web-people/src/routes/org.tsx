import { createFileRoute } from '@tanstack/react-router';
import { OrgChartPage } from '../pages/org-chart-page.tsx';

export const Route = createFileRoute('/_authed/people/org')({
  component: OrgChartPage,
});
