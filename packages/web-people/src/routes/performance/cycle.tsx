import { createFileRoute } from '@tanstack/react-router';
import { PerformanceSectionStub } from '../../components/performance-shell.tsx';

export const Route = createFileRoute('/_authed/people/performance/cycle')({
  component: () => <PerformanceSectionStub title="Cycle" />,
});
