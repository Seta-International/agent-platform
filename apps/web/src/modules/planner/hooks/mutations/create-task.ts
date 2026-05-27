import { toast } from '@seta/shared-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerKeys } from '../../state/query-keys';

interface CreateVars {
  plan_id: string;
  bucket_id?: string;
  title: string;
  description?: string;
  start_at?: string;
  due_at?: string;
  priority_number?: 1 | 3 | 5 | 9;
}

interface StartResponse {
  runId: string;
}

/**
 * Creates a task via the dedupOnCreate workflow. The workflow checks for
 * duplicates before creating — if duplicates are found, a HITL approval
 * card appears in the inbox.
 */
export function useCreateTask(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: CreateVars): Promise<StartResponse> => {
      const res = await fetch('/api/agent/v1/workflows/runs/dedupOnCreate/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: v.title,
          description: v.description,
          plan_id: v.plan_id,
          bucket_id: v.bucket_id,
        }),
        credentials: 'include',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Failed to create task (${res.status})`);
      }
      return (await res.json()) as StartResponse;
    },
    onSuccess: () => {
      toast.success('Task creation started', {
        description: 'Checking for duplicates…',
      });
      // Refresh task list after workflow likely completes (fast path ~2-3s)
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: plannerKeys.planTasks(planId, { plan_id: planId }) });
      }, 3000);
    },
    onError: (err) => {
      toast.error("Couldn't create task", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });
}
