import { createFileRoute } from '@tanstack/react-router';
import { CandidatesPage } from '../../pages/candidates-page.tsx';

export const Route = createFileRoute('/_authed/hiring/candidates/')({
  component: CandidatesPage,
});
