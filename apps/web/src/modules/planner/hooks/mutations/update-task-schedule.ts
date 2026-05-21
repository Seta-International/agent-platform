import { useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

interface UpdateScheduleVars {
  task_id: string;
  expected_version: number;
  start_at?: string | null;
  due_at?: string | null;
}

export function useUpdateTaskSchedule(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: UpdateScheduleVars) => {
      const patch: { start_at?: string | null; due_at?: string | null } = {};
      if (v.start_at !== undefined) patch.start_at = v.start_at;
      if (v.due_at !== undefined) patch.due_at = v.due_at;
      return plannerClient.updateTask({
        task_id: v.task_id,
        expected_version: v.expected_version,
        patch,
      });
    },
    onSuccess: (_data, v) => {
      qc.invalidateQueries({ queryKey: plannerKeys.task(v.task_id) });
      qc.invalidateQueries({ queryKey: plannerKeys.plan(planId) });
    },
  });
}
