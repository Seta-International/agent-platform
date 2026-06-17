import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/agent/')({
  beforeLoad: () => {
    throw redirect({ to: '/agent/chat' });
  },
});
