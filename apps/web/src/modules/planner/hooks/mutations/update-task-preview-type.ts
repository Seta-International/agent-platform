import type { TaskPreviewType } from '@seta/planner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

interface UpdatePreviewTypeVars {
  task_id: string;
  expected_version: number;
  preview_type: TaskPreviewType;
}

export function useUpdateTaskPreviewType(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: UpdatePreviewTypeVars) =>
      plannerClient.updateTask({
        task_id: v.task_id,
        expected_version: v.expected_version,
        patch: { preview_type: v.preview_type },
      }),
    onSuccess: (_data, v) => {
      qc.invalidateQueries({ queryKey: plannerKeys.task(v.task_id) });
      qc.invalidateQueries({ queryKey: plannerKeys.plan(planId) });
    },
  });
}
