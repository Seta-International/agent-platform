import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/planner/')({
  beforeLoad: () => {
    throw redirect({ to: '/planner/groups' });
  },
});
