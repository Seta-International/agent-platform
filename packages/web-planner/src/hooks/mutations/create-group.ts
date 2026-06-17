import type { GroupRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

type GroupTheme = 'teal' | 'purple' | 'green' | 'blue' | 'pink' | 'orange' | 'red';
type GroupVisibility = 'private' | 'public';
type GroupDefaultRole = 'owner' | 'member';

type CreateGroupInput = {
  name: string;
  description?: string;
  theme?: GroupTheme;
  visibility?: GroupVisibility;
  default_role?: GroupDefaultRole;
};

export function useCreateGroup() {
  return useOptimisticMutation<CreateGroupInput, GroupRow>({
    mutationFn: (v) => plannerClient.createGroup(v),
    snapshot: (_v, qc) => [
      { key: plannerKeys.myGroups(), prev: qc.getQueryData(plannerKeys.myGroups()) },
    ],
    applyOptimistic: (v, qc) => {
      const tempId = `temp-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const optimistic: GroupRow = {
        id: tempId,
        tenant_id: '',
        name: v.name,
        description: v.description ?? null,
        theme: v.theme ?? 'blue',
        visibility: v.visibility ?? 'private',
        default_role: v.default_role ?? 'member',
        external_source: 'native',
        external_id: null,
        external_synced_at: null,
        account_id: null,
        created_by: '',
        created_at: now,
        updated_at: now,
        deleted_at: null,
        version: 0,
      };
      qc.setQueryData<GroupRow[]>(plannerKeys.myGroups(), (prev) => [...(prev ?? []), optimistic]);
    },
    onServerOk: (server, _v, qc) => {
      qc.setQueryData<GroupRow[]>(plannerKeys.myGroups(), (prev) =>
        (prev ?? []).map((g) => (g.id.startsWith('temp-') ? server : g)),
      );
    },
    savingId: () => undefined,
    invalidate: () => [
      plannerKeys.myGroups(),
      plannerKeys.groups(),
      plannerKeys.groupsWithCounts(),
    ],
    errorMessage: (err) =>
      `Couldn't create group${err instanceof Error ? `: ${err.message}` : ''}.`,
  });
}
