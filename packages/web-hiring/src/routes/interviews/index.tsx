import { createFileRoute } from '@tanstack/react-router';
import { InterviewsPage } from '../../pages/interviews-page.tsx';

export const Route = createFileRoute('/_authed/hiring/interviews/')({
  component: InterviewsPage,
});
