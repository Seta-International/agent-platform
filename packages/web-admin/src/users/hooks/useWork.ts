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
  // Invalidate the whole work subtree so the sheet and the table converge after any write.
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: workKeys.all });
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
    }) => createWorkerAllocation({ ...body, worker_id: workerId, status: 'tentative' }),
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
