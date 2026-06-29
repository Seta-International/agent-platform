import type {
  BucketRow,
  GroupRow,
  PlanRow,
  TaskDetailRow,
  TaskWithAssigneesRow,
} from '@seta/planner';
import type { QueryClient } from '@tanstack/react-query';
import { PlannerClientError } from '../api/planner-client';
import { plannerKeys } from './query-keys';

/**
 * When the server responds 409 CONFLICT on an `expected_version` mutation, the
 * body carries `details.current_version` with the canonical row version. Patch
 * that into every cache that exposes the row so the next user attempt sends a
 * fresh `expected_version` instead of perma-failing with the same stale value.
 */
export function parseConflictVersion(err: unknown): number | undefined {
  if (!(err instanceof PlannerClientError) || err.status !== 409) return undefined;
  const details = (err.body as { details?: { current_version?: unknown } }).details;
  return typeof details?.current_version === 'number' ? details.current_version : undefined;
}

export function patchTaskVersion(
  qc: QueryClient,
  planId: string,
  taskId: string,
  version: number,
): void {
  qc.setQueryData<TaskWithAssigneesRow[]>(
    plannerKeys.planTasks(planId, { plan_id: planId }),
    (prev) => (prev ? prev.map((t) => (t.id === taskId ? { ...t, version } : t)) : prev),
  );
  qc.setQueryData<TaskDetailRow>(plannerKeys.task(taskId), (prev) =>
    prev ? { ...prev, version } : prev,
  );
}

export function patchBucketVersion(
  qc: QueryClient,
  planId: string,
  bucketId: string,
  version: number,
): void {
  qc.setQueryData<BucketRow[]>([...plannerKeys.plan(planId), 'buckets'] as const, (prev) =>
    prev ? prev.map((b) => (b.id === bucketId ? { ...b, version } : b)) : prev,
  );
}

export function patchPlanVersion(qc: QueryClient, planId: string, version: number): void {
  qc.setQueryData<PlanRow>(plannerKeys.plan(planId), (prev) =>
    prev ? { ...prev, version } : prev,
  );
}

export function patchGroupVersion(qc: QueryClient, groupId: string, version: number): void {
  qc.setQueryData<GroupRow>(plannerKeys.group(groupId), (prev) =>
    prev ? { ...prev, version } : prev,
  );
}
