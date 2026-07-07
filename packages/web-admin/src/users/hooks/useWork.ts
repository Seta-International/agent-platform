import { toast } from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorkerAllocation,
  deleteWorkerAllocation,
  getWorkerProfile,
  listOrgUnits,
  listWorkerAllocations,
  listWorkersBrief,
  patchWorker,
} from '../api/work-client.ts';
import { directoryKeys } from '../state/query-keys.ts';

/** Local calendar date (YYYY-MM-DD). Tentative allocations require a start date. */
function localToday(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export const workKeys = {
  all: ['admin', 'work'] as const,
  profile: (workerId: string) => [...workKeys.all, 'profile', workerId] as const,
  allocations: (workerId: string) => [...workKeys.all, 'allocations', workerId] as const,
  brief: (ids: string[]) => [...workKeys.all, 'brief', ids.join(',')] as const,
  orgUnits: () => [...workKeys.all, 'org-units'] as const,
};

export function useWorkerProfile(workerId: string | null) {
  return useQuery({
    queryKey: workKeys.profile(workerId ?? ''),
    queryFn: () => getWorkerProfile(workerId as string),
    enabled: !!workerId,
  });
}

export function useWorkerAllocations(workerId: string | null) {
  return useQuery({
    queryKey: workKeys.allocations(workerId ?? ''),
    queryFn: () => listWorkerAllocations(workerId as string),
    enabled: !!workerId,
  });
}

export function useWorkersBrief(ids: string[]) {
  return useQuery({
    queryKey: workKeys.brief(ids),
    queryFn: () => listWorkersBrief(ids),
    enabled: ids.length > 0,
  });
}

export function useOrgUnits() {
  return useQuery({ queryKey: workKeys.orgUnits(), queryFn: listOrgUnits });
}

export function useWorkMutations(workerId: string) {
  const qc = useQueryClient();
  // The directory list re-reads people projections; the drawer re-reads pm live.
  // Invalidate the whole work subtree plus the directory list (it carries job_title)
  // so the sheet and the table converge after any write. The table's sources
  // (identity.directory_person, people.worker_allocation_projection) are event-driven
  // projections, so kick once more after the subscribers' LISTEN/NOTIFY + 2s poll window.
  const invalidate = () => {
    const kick = () => {
      void qc.invalidateQueries({ queryKey: workKeys.all });
      void qc.invalidateQueries({ queryKey: directoryKeys.all });
    };
    kick();
    setTimeout(kick, 2500);
  };

  const editWorker = useMutation({
    mutationFn: ({
      expectedVersion,
      patch,
    }: {
      expectedVersion: number;
      patch: { job_title?: string | null; org_unit_id?: string | null };
    }) => patchWorker(workerId, expectedVersion, patch),
    onSuccess: () => toast.success('Profile updated'),
    onError: (e) => toast.error((e as Error).message),
    onSettled: invalidate,
  });

  const addAllocation = useMutation({
    mutationFn: (body: {
      project_id: string;
      role?: string | null;
      planned_pct?: number | null;
      date_from?: string | null;
      date_to?: string | null;
    }) =>
      createWorkerAllocation({
        ...body,
        worker_id: workerId,
        status: 'tentative',
        date_from: body.date_from ?? localToday(),
      }),
    onSuccess: () => toast.success('Project added'),
    onError: (e) => toast.error((e as Error).message),
    onSettled: invalidate,
  });

  const removeAllocation = useMutation({
    mutationFn: (allocationId: string) => deleteWorkerAllocation(allocationId),
    onSuccess: () => toast.success('Project removed'),
    onError: (e) => toast.error((e as Error).message),
    onSettled: invalidate,
  });

  return { editWorker, addAllocation, removeAllocation };
}
