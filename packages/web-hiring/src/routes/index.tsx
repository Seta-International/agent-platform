import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/hiring/')({
  beforeLoad: () => {
    throw redirect({ to: '/hiring/requisitions' });
  },
});
