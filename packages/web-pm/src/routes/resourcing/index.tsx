import { createFileRoute } from '@tanstack/react-router';
import { RaMonitoringPage } from '../../pages/ra-monitoring-page.tsx';

export const Route = createFileRoute('/_authed/pm/resourcing/')({
  component: RaMonitoringPage,
});
