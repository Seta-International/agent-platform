import { createFileRoute } from '@tanstack/react-router';
import { AdminUsers } from '@/modules/identity/pages/AdminUsers.tsx';

export const Route = createFileRoute('/_authed/admin/users')({ component: AdminUsers });
