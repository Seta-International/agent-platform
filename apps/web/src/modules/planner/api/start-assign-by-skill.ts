import { useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerKeys } from '../state/query-keys';

interface StartResponse {
  runId: string;
}

export function useStartAssignBySkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string): Promise<StartResponse> => {
      const res = await fetch('/api/copilot/v1/workflows/runs/assignBySkill/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
        credentials: 'include',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Failed to start Suggest (${res.status})`);
      }
      return (await res.json()) as StartResponse;
    },
    onSuccess: (_data, taskId) => {
      qc.invalidateQueries({ queryKey: plannerKeys.task(taskId) });
    },
  });
}
