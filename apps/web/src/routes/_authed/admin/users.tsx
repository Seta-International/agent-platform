import { createFileRoute } from '@tanstack/react-router';
import { AdminUsers } from '@/modules/identity/pages/AdminUsers.tsx';

export interface AdminUsersSearch {
  q?: string;
  role?: string;
  status?: 'active' | 'deactivated' | 'ooo';
  sign_in_method?: 'credential' | 'microsoft' | 'both';
  offset?: number;
}

const VALID_STATUSES = ['active', 'deactivated', 'ooo'] as const;
const VALID_METHODS = ['credential', 'microsoft', 'both'] as const;

export const Route = createFileRoute('/_authed/admin/users')({
  validateSearch: (s: Record<string, unknown>): AdminUsersSearch => {
    const status =
      typeof s.status === 'string' && (VALID_STATUSES as readonly string[]).includes(s.status)
        ? (s.status as 'active' | 'deactivated' | 'ooo')
        : undefined;
    const method =
      typeof s.sign_in_method === 'string' &&
      (VALID_METHODS as readonly string[]).includes(s.sign_in_method)
        ? (s.sign_in_method as 'credential' | 'microsoft' | 'both')
        : undefined;
    const offsetN = typeof s.offset === 'number' ? s.offset : Number(s.offset);
    return {
      q: typeof s.q === 'string' && s.q.length > 0 ? s.q : undefined,
      role: typeof s.role === 'string' && s.role.length > 0 ? s.role : undefined,
      status,
      sign_in_method: method,
      offset: Number.isFinite(offsetN) && offsetN > 0 ? offsetN : undefined,
    };
  },
  component: AdminUsers,
});
