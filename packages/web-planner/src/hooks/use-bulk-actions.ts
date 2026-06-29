import { useQueryClient } from '@tanstack/react-query';
import { PlannerClientError, plannerClient } from '../api/planner-client';
import { plannerKeys } from '../state/query-keys';

interface BulkMoveInput {
  tasks: Array<{ id: string; expected_version: number }>;
  to_bucket_id: string | null;
}

interface BulkAssignInput {
  tasks: string[];
  user_id: string;
}

interface BulkSetDueInput {
  tasks: Array<{ id: string; expected_version: number }>;
  due_at: string | null;
}

interface BulkDeleteInput {
  tasks: Array<{ id: string; expected_version: number }>;
}

export interface BulkResult {
  ok: number;
  failed: number;
  failedPermissions: Array<{ taskId: string; permission: string }>;
  succeededIds: string[];
}

function extractPermission(err: unknown): string | undefined {
  if (!(err instanceof PlannerClientError) || err.status !== 403) return undefined;
  const details = err.body.details;
  if (details && typeof details === 'object' && 'permission' in details) {
    const permission = (details as { permission: unknown }).permission;
    return typeof permission === 'string' ? permission : undefined;
  }
  return undefined;
}

function aggregate(results: PromiseSettledResult<unknown>[], taskIds: string[]): BulkResult {
  let ok = 0;
  let failed = 0;
  const failedPermissions: BulkResult['failedPermissions'] = [];
  const succeededIds: string[] = [];
  for (const [i, r] of results.entries()) {
    const taskId = taskIds[i];
    if (!taskId) continue;
    if (r.status === 'fulfilled') {
      ok += 1;
      succeededIds.push(taskId);
    } else {
      failed += 1;
      const permission = extractPermission(r.reason);
      if (permission) failedPermissions.push({ taskId, permission });
    }
  }
  return { ok, failed, failedPermissions, succeededIds };
}

export function useBulkActions(planId: string) {
  const qc = useQueryClient();

  async function refreshAfterBulk(succeededIds: string[]) {
    if (succeededIds.length === 0) return;
    await qc.invalidateQueries({ queryKey: [...plannerKeys.plan(planId), 'tasks'] });
    await qc.invalidateQueries({ queryKey: plannerKeys.planCalendar(planId) });
    await Promise.all(
      succeededIds.flatMap((id) => [
        qc.invalidateQueries({ queryKey: plannerKeys.task(id) }),
        qc.invalidateQueries({ queryKey: plannerKeys.taskEvents(id) }),
      ]),
    );
  }
  async function bulkMove(input: BulkMoveInput): Promise<BulkResult> {
    const results = await Promise.allSettled(
      input.tasks.map((t) =>
        plannerClient.moveTask({
          task_id: t.id,
          expected_version: t.expected_version,
          bucket_id: input.to_bucket_id,
        }),
      ),
    );
    const out = aggregate(
      results,
      input.tasks.map((t) => t.id),
    );
    await refreshAfterBulk(out.succeededIds);
    return out;
  }

  async function bulkAssign(input: BulkAssignInput): Promise<BulkResult> {
    const results = await Promise.allSettled(
      input.tasks.map((id) => plannerClient.assignTask({ task_id: id, user_id: input.user_id })),
    );
    const out = aggregate(results, input.tasks);
    await refreshAfterBulk(out.succeededIds);
    return out;
  }

  async function bulkSetDue(input: BulkSetDueInput): Promise<BulkResult> {
    const results = await Promise.allSettled(
      input.tasks.map((t) =>
        plannerClient.updateTask({
          task_id: t.id,
          expected_version: t.expected_version,
          patch: { due_at: input.due_at ?? undefined },
        }),
      ),
    );
    const out = aggregate(
      results,
      input.tasks.map((t) => t.id),
    );
    await refreshAfterBulk(out.succeededIds);
    return out;
  }

  async function bulkDelete(input: BulkDeleteInput): Promise<BulkResult> {
    const results = await Promise.allSettled(
      input.tasks.map((t) =>
        plannerClient.deleteTask({ task_id: t.id, expected_version: t.expected_version }),
      ),
    );
    const out = aggregate(
      results,
      input.tasks.map((t) => t.id),
    );
    await refreshAfterBulk(out.succeededIds);
    return out;
  }

  return { bulkMove, bulkAssign, bulkSetDue, bulkDelete };
}
