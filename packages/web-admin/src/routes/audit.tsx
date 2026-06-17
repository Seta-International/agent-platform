import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { AdminAudit } from '../audit/pages/AdminAudit.tsx';

const SORT_BYS = ['occurred_at', 'event_type'] as const;
const SORT_DIRS = ['asc', 'desc'] as const;

export const auditSearchSchema = z.object({
  event_type: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sort_by: z.enum(SORT_BYS).optional(),
  sort_dir: z.enum(SORT_DIRS).optional(),
  page_size: z.coerce.number().int().positive().max(200).optional(),
  page_index: z.coerce.number().int().nonnegative().optional(),
});

export type AdminAuditSearch = z.infer<typeof auditSearchSchema>;

export const Route = createFileRoute('/_authed/admin/audit')({
  validateSearch: auditSearchSchema,
  component: function AdminAuditRoute() {
    const search = Route.useSearch();
    const navigate = useNavigate({ from: Route.fullPath });
    return (
      <AdminAudit
        search={search}
        onSearch={(next) => {
          void navigate({ search: (prev) => next(prev) });
        }}
      />
    );
  },
});
