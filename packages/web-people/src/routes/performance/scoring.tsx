import { createFileRoute } from '@tanstack/react-router';
import { EvaluatePage } from '../../pages/evaluate-page.tsx';

export const Route = createFileRoute('/_authed/people/performance/scoring')({
  component: EvaluatePage,
});
