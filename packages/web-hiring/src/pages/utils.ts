import type { ShowToastFn } from '@seta/shared-ui';
import { useQuery, type useQueryClient } from '@tanstack/react-query';
import { fetchRequisition, type OpenRequisitionsBoard } from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';

// FUT-326/327/328 — the board's scope note. `all` (oversight) shows nothing; `scoped`
// combines whatever accounts (AM) and/or projects (EM/TL/PM) the viewer is scoped to.
export function buildScopeNote(data: OpenRequisitionsBoard | undefined): string | null {
  if (data?.scope !== 'scoped') return null;
  const names = [...data.scoped_account_names, ...data.scoped_project_names];
  return names.length > 0
    ? `Showing requisitions for: ${names.join(', ')}`
    : 'You are not assigned as Account Manager or Project lead on any active account or project.';
}

export function useRequisition(id: string) {
  return useQuery({ queryKey: hiringKeys.requisition(id), queryFn: () => fetchRequisition(id) });
}

export function capitalizeErrorMessage(msg: string | undefined): string {
  if (!msg) return 'Operation failed';
  const trimmed = msg.trim();
  if (!trimmed) return 'Operation failed';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function on409(
  toast: ShowToastFn,
  e: Error,
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: readonly unknown[],
): void {
  const isConcurrencyConflict =
    e.message === 'version mismatch' ||
    e.message.includes('modified concurrently') ||
    e.message.includes('version mismatch');

  if ((e as { status?: number }).status === 409) {
    if (isConcurrencyConflict) {
      toast({
        body: 'This record changed — refreshing.',
        type: 'error',
        isAutoHide: true,
        autoHideDuration: 6000,
      });
    } else {
      toast({
        body: capitalizeErrorMessage(e.message),
        type: 'error',
        isAutoHide: true,
        autoHideDuration: 6000,
      });
    }
    void queryClient.invalidateQueries({ queryKey });
  } else {
    toast({
      body: capitalizeErrorMessage(e.message),
      type: 'error',
      isAutoHide: true,
      autoHideDuration: 6000,
    });
  }
}
