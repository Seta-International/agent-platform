import { createFileRoute } from '@tanstack/react-router';
import { LoginCard } from '@/modules/identity/components/LoginCard.tsx';

export const Route = createFileRoute('/login')({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === 'string' ? s.redirect : undefined,
    reason: typeof s.reason === 'string' ? s.reason : undefined,
  }),
  component: LoginCard,
});
