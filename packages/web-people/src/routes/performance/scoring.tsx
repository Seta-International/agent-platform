import { createFileRoute } from '@tanstack/react-router';
import { PerformanceSectionStub } from '../../components/performance-shell.tsx';

function ScoringPage() {
  return <PerformanceSectionStub title="Scoring" />;
}

export const Route = createFileRoute('/_authed/people/performance/scoring')({
  component: ScoringPage,
});
