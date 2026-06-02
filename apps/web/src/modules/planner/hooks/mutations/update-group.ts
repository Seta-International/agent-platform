import type { GroupRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { parseConflictVersion, patchGroupVersion } from '../../state/version-reconcile';
import { useOptimisticMutation } from '../use-optimistic-mutation';

type GroupPatch = {
  name?: string;
  description?: string | null;
  theme?: 'teal' | 'purple' | 'green' | 'blue' | 'pink' | 'orange' | 'red';
  visibility?: 'private' | 'public';
  default_role?: 'owner' | 'member';
};

export function useUpdateGroup(groupId: string) {
  return useOptimisticMutation<{ expected_version: number; patch: GroupPatch }, GroupRow>({
    mutationFn: (v) => plannerClient.updateGroup({ group_id: groupId, ...v }),
    snapshot: (_v, qc) => [
      { key: plannerKeys.group(groupId), prev: qc.getQueryData(plannerKeys.group(groupId)) },
      { key: plannerKeys.myGroups(), prev: qc.getQueryData(plannerKeys.myGroups()) },
    ],
    applyOptimistic: (v, qc) => {
      qc.setQueryData<GroupRow>(plannerKeys.group(groupId), (g) => (g ? { ...g, ...v.patch } : g));
      qc.setQueryData<GroupRow[]>(plannerKeys.myGroups(), (gs) =>
        (gs ?? []).map((g) => (g.id === groupId ? { ...g, ...v.patch } : g)),
      );
    },
    onServerOk: (server, _v, qc) => {
      qc.setQueryData(plannerKeys.group(groupId), server);
      qc.setQueryData<GroupRow[]>(plannerKeys.myGroups(), (gs) =>
        (gs ?? []).map((g) => (g.id === groupId ? server : g)),
      );
    },
    savingId: () => groupId,
    invalidate: () => [plannerKeys.group(groupId), plannerKeys.myGroups()],
    errorMessage: (err) =>
      err && typeof err === 'object' && (err as { status?: number }).status === 409
        ? 'Someone else updated this — refreshed.'
        : "Couldn't save group changes.",
    onConflict: (err, _vars, qc) => {
      const v = parseConflictVersion(err);
      if (v !== undefined) patchGroupVersion(qc, groupId, v);
    },
  });
}
