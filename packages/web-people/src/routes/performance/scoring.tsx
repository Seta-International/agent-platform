import { createFileRoute, useSearch } from '@tanstack/react-router';
import { currentMonth } from '../../api/performance-query.ts';
import { PerformanceSectionStub } from '../../components/performance-shell.tsx';
import type { PerformanceScopeSearch } from '../../state/performance-scope.ts';

function ScoringPage() {
  const search = useSearch({ strict: false }) as PerformanceScopeSearch;
  return <PerformanceSectionStub title="Scoring" month={search.month ?? currentMonth()} />;
}

export const Route = createFileRoute('/_authed/people/performance/scoring')({
  component: ScoringPage,
});
