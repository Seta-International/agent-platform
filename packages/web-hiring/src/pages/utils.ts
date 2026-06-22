import { toast } from '@seta/shared-ui';
import { useQuery, type useQueryClient } from '@tanstack/react-query';
import { fetchRequisition } from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';

export function useRequisition(id: string) {
  return useQuery({ queryKey: hiringKeys.requisition(id), queryFn: () => fetchRequisition(id) });
}

export function on409(
  e: Error,
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: readonly unknown[],
): void {
  if ((e as { status?: number }).status === 409) {
    toast.error('This record changed — refreshing.');
    void queryClient.invalidateQueries({ queryKey });
  } else {
    toast.error(e.message);
  }
}
