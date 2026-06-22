import { createFileRoute } from '@tanstack/react-router';
import { WorkerProfilePage } from '../../pages/worker-profile-page.tsx';

export const Route = createFileRoute('/_authed/people/employees/$workerId')({
  component: WorkerProfilePage,
});
