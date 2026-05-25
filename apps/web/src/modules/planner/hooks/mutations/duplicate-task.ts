import type { TaskWithAssigneesRow } from '@seta/planner';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';
import { useOptimisticMutation } from '../use-optimistic-mutation';

export interface DuplicateOptions {
  include_description?: boolean;
  include_checklist?: boolean;
  include_assignees?: boolean;
  include_labels?: boolean;
  include_references?: boolean;
  include_dates?: boolean;
}

interface DuplicateVars {
  task_id: string;
  options: DuplicateOptions;
}

/**
 * Duplicates a task on the server. No optimistic insert — the server is the
 * source of truth for the new id, and the caller typically navigates to the
 * returned task right after success. We invalidate the plan's task list so
 * the new card appears in the bucket without a full board refetch dance.
 */
export function useDuplicateTask(planId: string) {
  const listKey = plannerKeys.planTasks(planId, { plan_id: planId });

  return useOptimisticMutation<DuplicateVars, TaskWithAssigneesRow>({
    mutationFn: (v) => plannerClient.duplicateTask(v),
    snapshot: () => [],
    applyOptimistic: () => {},
    onServerOk: () => {},
    savingId: () => undefined,
    invalidate: () => [listKey],
    errorMessage: () => "Couldn't duplicate task.",
  });
}
