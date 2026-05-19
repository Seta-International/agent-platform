import { createFileRoute } from '@tanstack/react-router';
import { AdminAudit } from '@/modules/identity/pages/AdminAudit.tsx';

export const Route = createFileRoute('/_authed/admin/audit')({ component: AdminAudit });
