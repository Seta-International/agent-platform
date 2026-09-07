import { createFileRoute } from '@tanstack/react-router';
import { MoraleHistoryPage } from '../../pages/morale-history-page.tsx';

export const Route = createFileRoute('/_authed/people/morale/history')({
  component: MoraleHistoryPage,
});
