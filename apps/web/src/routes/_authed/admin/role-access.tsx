import { createFileRoute } from '@tanstack/react-router';
import { RoleAccess } from '@/modules/admin/role-access/pages/RoleAccess.tsx';

export const Route = createFileRoute('/_authed/admin/role-access')({
  component: RoleAccess,
});
