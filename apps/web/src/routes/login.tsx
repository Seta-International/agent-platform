import { ensureSession, LoginCard } from '@seta/web-identity';
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/login')({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === 'string' ? s.redirect : undefined,
    reason: typeof s.reason === 'string' ? s.reason : undefined,
  }),
  beforeLoad: async ({ context }) => {
    const session = await ensureSession(context.queryClient);
    if (session) throw redirect({ to: '/' });
  },
  component: LoginCard,
});
