import { createFileRoute } from '@tanstack/react-router';
import { OrgChart } from '@/modules/admin/org-chart/pages/OrgChart.tsx';

export const Route = createFileRoute('/_authed/admin/org-chart')({
  component: OrgChart,
});
