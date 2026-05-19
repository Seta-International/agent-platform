import { createFileRoute, redirect } from '@tanstack/react-router';
import { fetchMe } from '@/modules/identity/api/client.ts';
import { LoginCard } from '@/modules/identity/components/LoginCard.tsx';

export const Route = createFileRoute('/login')({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === 'string' ? s.redirect : undefined,
    reason: typeof s.reason === 'string' ? s.reason : undefined,
  }),
  beforeLoad: async () => {
    const session = await fetchMe();
    if (session) throw redirect({ to: '/' });
  },
  component: LoginCard,
});
