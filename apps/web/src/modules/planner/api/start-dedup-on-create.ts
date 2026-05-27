import { useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerKeys } from '../state/query-keys';

interface StartResponse {
  runId: string;
}

export interface StartDedupInput {
  title: string;
  description?: string;
  skill_tags?: string[];
  plan_id?: string;
  bucket_id?: string;
}

export function useStartDedupOnCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: StartDedupInput): Promise<StartResponse> => {
      const res = await fetch('/api/agent/v1/workflows/runs/dedupOnCreate/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
        credentials: 'include',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Failed to start dedup check (${res.status})`);
      }
      return (await res.json()) as StartResponse;
    },
    onSuccess: (_data, draft) => {
      // Invalidate plan tasks so the list refreshes when workflow completes
      if (draft.plan_id) {
        qc.invalidateQueries({ queryKey: plannerKeys.planTasks(draft.plan_id, {}) });
      }
    },
  });
}
