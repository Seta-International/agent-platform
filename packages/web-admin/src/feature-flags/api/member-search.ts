import { createHttpEntitySearch, type EntityOption } from '@seta/shared-ui';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

type MemberRow = { user_id: string; display_name: string; email: string };

export const memberSearch = createHttpEntitySearch<MemberRow>({
  path: '/api/identity/v1/feature-flags/members',
  extract: (j) => (j as { rows: MemberRow[] }).rows,
  mapRow: (m) => ({ value: m.user_id, label: `${m.display_name} · ${m.email}` }),
});

export function useMemberSearch(): {
  search: (q: string) => Promise<EntityOption[]>;
  resolveByIds: (ids: string[]) => Promise<EntityOption[]>;
} {
  const qc = useQueryClient();
  return useMemo(
    () => ({
      search: (q: string) =>
        qc.fetchQuery({
          queryKey: ['admin', 'flag-member-search', q],
          queryFn: () => memberSearch.search(q),
          staleTime: 30_000,
        }),
      resolveByIds: (ids: string[]) =>
        ids.length === 0
          ? Promise.resolve([])
          : qc.fetchQuery({
              queryKey: ['admin', 'flag-member-resolve', [...ids].sort()],
              queryFn: () => memberSearch.resolveByIds(ids),
              staleTime: 5 * 60_000,
            }),
    }),
    [qc],
  );
}
