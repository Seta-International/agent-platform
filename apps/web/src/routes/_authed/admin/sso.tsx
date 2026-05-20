import { createFileRoute } from '@tanstack/react-router';
import { AdminSso } from '@/modules/identity/pages/AdminSso.tsx';

export const Route = createFileRoute('/_authed/admin/sso')({
  validateSearch: (s: Record<string, unknown>) => ({
    status: typeof s.status === 'string' ? s.status : undefined,
    error: typeof s.error === 'string' ? s.error : undefined,
  }),
  component: function SsoPage() {
    const { status, error } = Route.useSearch();
    return <AdminSso status={status} error={error} />;
  },
});
