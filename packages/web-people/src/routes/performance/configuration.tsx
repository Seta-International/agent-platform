import { createFileRoute } from '@tanstack/react-router';
import { PerformanceConfigurationPage } from '../../pages/performance-configuration-page.tsx';

export const Route = createFileRoute('/_authed/people/performance/configuration')({
  component: PerformanceConfigurationPage,
});
