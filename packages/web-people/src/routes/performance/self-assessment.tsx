import { createFileRoute } from '@tanstack/react-router';
import { PerformanceSectionStub } from '../../components/performance-shell.tsx';

function SelfAssessmentPage() {
  return <PerformanceSectionStub title="Self-assessment" />;
}

export const Route = createFileRoute('/_authed/people/performance/self-assessment')({
  component: SelfAssessmentPage,
});
