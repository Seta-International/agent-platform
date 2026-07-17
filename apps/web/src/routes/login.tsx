import { ensureSession, LoginCard } from '@seta/web-identity';
import { createFileRoute, redirect } from '@tanstack/react-router';

// Exported directly (not read back off `Route.options`) because the route config's
// `validateSearch` type is a union of validator shapes with no common call signature —
// tests need a plain, callable function to pin the param-stripping behaviour.
export function validateLoginSearch(s: Record<string, unknown>) {
  return {
    redirect: typeof s.redirect === 'string' ? s.redirect : undefined,
    reason: typeof s.reason === 'string' ? s.reason : undefined,
    error: typeof s.error === 'string' ? s.error : undefined,
  };
}

export const Route = createFileRoute('/login')({
  validateSearch: validateLoginSearch,
  beforeLoad: async ({ context }) => {
    const session = await ensureSession(context.queryClient);
    if (session) throw redirect({ to: '/' });
  },
  component: LoginCard,
});
