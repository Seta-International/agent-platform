import { PlannerClientError, plannerClient } from '../api/planner-client';

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
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const taskId = taskIds[i]!;
    if (r.status === 'fulfilled') {
      ok += 1;
    } else {
      failed += 1;
      const permission = extractPermission(r.reason);
      if (permission) failedPermissions.push({ taskId, permission });
    }
  }
  return { ok, failed, failedPermissions };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useBulkActions(_planId: string) {
  async function bulkMove(input: BulkMoveInput): Promise<BulkResult> {
    const results = await Promise.allSettled(
      input.tasks.map((t) =>
        plannerClient.moveTask({
          task_id: t.id,
          expected_version: t.expected_version,
          to_bucket_id: input.to_bucket_id,
        }),
      ),
    );
    return aggregate(
      results,
      input.tasks.map((t) => t.id),
    );
  }

  async function bulkAssign(input: BulkAssignInput): Promise<BulkResult> {
    const results = await Promise.allSettled(
      input.tasks.map((id) => plannerClient.assignTask({ task_id: id, user_id: input.user_id })),
    );
    return aggregate(results, input.tasks);
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
    return aggregate(
      results,
      input.tasks.map((t) => t.id),
    );
  }

  async function bulkDelete(input: BulkDeleteInput): Promise<BulkResult> {
    const results = await Promise.allSettled(
      input.tasks.map((t) =>
        plannerClient.deleteTask({ task_id: t.id, expected_version: t.expected_version }),
      ),
    );
    return aggregate(
      results,
      input.tasks.map((t) => t.id),
    );
  }

  return { bulkMove, bulkAssign, bulkSetDue, bulkDelete };
}
