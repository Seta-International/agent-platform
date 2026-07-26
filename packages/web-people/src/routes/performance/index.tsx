import { createFileRoute } from '@tanstack/react-router';
import { PerformanceHome } from '../../components/performance-home.tsx';

export const Route = createFileRoute('/_authed/people/performance/')({
  component: PerformanceHome,
});
