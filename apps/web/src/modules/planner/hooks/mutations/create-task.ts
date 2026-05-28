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

interface TaskResponse {
  id: string;
  title: string;
  version: number;
}

/**
 * Creates a task immediately via the planner API, then triggers the
 * dedupOnCreate workflow in background. If duplicates are found, a HITL
 * card appears in the Inbox with Link / Delete / Leave options.
 */
export function useCreateTask(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: CreateVars): Promise<{ task: TaskResponse; runId?: string }> => {
      // Step 1: Create the task immediately
      const createRes = await fetch('/api/planner/v1/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: v.plan_id,
          bucket_id: v.bucket_id,
          title: v.title,
          description: v.description,
        }),
        credentials: 'include',
      });
      if (!createRes.ok) {
        const body = (await createRes.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Failed to create task (${createRes.status})`);
      }
      const task = (await createRes.json()) as TaskResponse;

      // Step 2: Start dedup workflow in background
      let runId: string | undefined;
      try {
        const dedupRes = await fetch('/api/agent/v1/workflows/runs/planner.dedupOnCreate/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: task.id,
            title: v.title,
            description: v.description ?? '',
            plan_id: v.plan_id,
          }),
          credentials: 'include',
        });
        if (dedupRes.ok) {
          const dedupData = (await dedupRes.json()) as { runId: string };
          runId = dedupData.runId;
        }
      } catch {
        // Dedup check failed silently — task is still created
      }

      return { task, runId };
    },
    onSuccess: () => {
      toast.success('Task created', {
        description: 'Checking for duplicates in background…',
      });
      qc.invalidateQueries({ queryKey: plannerKeys.planTasks(planId, { plan_id: planId }) });
    },
    onError: (err) => {
      toast.error("Couldn't create task", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });
}
