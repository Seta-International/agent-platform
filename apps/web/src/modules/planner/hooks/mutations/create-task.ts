import type { TaskRow, TaskWithAssigneesRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

interface CreateVars {
  plan_id: string;
  bucket_id?: string;
  title: string;
}

export function useCreateTask(planId: string) {
  const key = plannerKeys.planTasks(planId, { plan_id: planId });
  return useOptimisticMutation<CreateVars, TaskRow>({
    mutationFn: (v) => plannerClient.createTask(v),
    snapshot: (_v, qc) => [{ key, prev: qc.getQueryData(key) }],
    applyOptimistic: (v, qc) => {
      const now = new Date().toISOString();
      // crypto.randomUUID is available in modern browsers and Node 19+; fall back for older envs.
      const tempId = `temp-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
      const optimistic: TaskWithAssigneesRow = {
        id: tempId,
        tenant_id: '',
        plan_id: v.plan_id,
        bucket_id: v.bucket_id ?? null,
        title: v.title,
        description: null,
        priority: 'medium',
        progress: 'not_started',
        review_state: null,
        skill_tags: [],
        due_at: null,
        sort_order: Number.MAX_SAFE_INTEGER / 2,
        created_by: '',
        created_at: now,
        updated_at: now,
        deleted_at: null,
        version: 0,
        assignees: [],
        labels: [],
        checklist_summary: { total: 0, checked: 0 },
      };
      qc.setQueryData<TaskWithAssigneesRow[]>(key, (prev) => [...(prev ?? []), optimistic]);
    },
    onServerOk: (server, _v, qc) => {
      // Replace the first temp row with the real server row; keeps assignees/labels/checklist_summary
      // from the optimistic entry (which are empty arrays/object — the server also returns none).
      qc.setQueryData<TaskWithAssigneesRow[]>(key, (prev) =>
        prev
          ? prev.map((t) =>
              t.id.startsWith('temp-')
                ? {
                    ...t,
                    ...server,
                    assignees: t.assignees,
                    labels: t.labels,
                    checklist_summary: t.checklist_summary,
                  }
                : t,
            )
          : prev,
      );
    },
    savingId: () => undefined,
    invalidate: () => [],
    errorMessage: () => "Couldn't create task.",
  });
}
