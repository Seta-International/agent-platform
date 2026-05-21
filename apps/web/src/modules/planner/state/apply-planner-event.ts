import type { BucketRow, TaskWithAssigneesRow } from '@seta/planner';
import type { QueryClient } from '@tanstack/react-query';
import { plannerKeys } from './query-keys';
import { isOwnEcho } from './recent-mutation-event-ids';
import { useRecentlyMovedTasks } from './recently-moved-tasks';

export interface StreamEvent {
  id: string;
  eventType: string;
  eventVersion: number;
  aggregateType: string;
  aggregateId: string;
  tenantId: string;
  occurredAt: string | Date;
  payload: Record<string, unknown>;
}

function asObject(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}
function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

function payloadField(p: Record<string, unknown>, field: string): string | undefined {
  return asString(p[field]);
}

const tasksKey = (planId: string) => plannerKeys.planTasks(planId, { plan_id: planId });
const bucketsKey = (planId: string) => [...plannerKeys.plan(planId), 'buckets'] as const;

export function applyPlannerEvent(qc: QueryClient, event: StreamEvent): void {
  if (isOwnEcho(event.id)) return;

  const p = event.payload;
  const groupId = payloadField(p, 'group_id');
  const planId = payloadField(p, 'plan_id');
  const taskId = payloadField(p, 'task_id');

  switch (event.eventType) {
    case 'planner.group.created':
    case 'planner.group.deleted':
    case 'planner.group.restored':
      qc.invalidateQueries({ queryKey: plannerKeys.groups() });
      return;
    case 'planner.group.updated':
      if (groupId) qc.invalidateQueries({ queryKey: plannerKeys.group(groupId) });
      qc.invalidateQueries({ queryKey: plannerKeys.groups() });
      return;
    case 'planner.group.member.added':
    case 'planner.group.member.removed':
      if (groupId) qc.invalidateQueries({ queryKey: plannerKeys.groupMembers(groupId) });
      qc.invalidateQueries({ queryKey: plannerKeys.myGroups() });
      return;

    case 'planner.plan.created':
    case 'planner.plan.updated':
    case 'planner.plan.deleted':
    case 'planner.plan.restored':
      if (groupId) qc.invalidateQueries({ queryKey: plannerKeys.groupPlans(groupId) });
      if (planId) qc.invalidateQueries({ queryKey: plannerKeys.plan(planId) });
      return;

    case 'planner.bucket.created': {
      const after = asObject(p.after);
      const afterPlan = after && asString(after.plan_id);
      const id = after && asString(after.bucket_id);
      if (!after || !afterPlan || !id) return;
      qc.setQueryData<BucketRow[]>(bucketsKey(afterPlan), (prev) => {
        if (!prev) return prev;
        if (prev.some((b) => b.id === id)) return prev;
        const now = new Date().toISOString();
        const fresh: BucketRow = {
          id,
          tenant_id: event.tenantId,
          plan_id: afterPlan,
          name: asString(after.name) ?? '',
          sort_order: asNumber(after.sort_order) ?? 0,
          created_at: now,
          updated_at: now,
          deleted_at: null,
          version: 1,
        };
        return [...prev, fresh];
      });
      return;
    }

    case 'planner.bucket.updated': {
      const bucketId = asString(p.bucket_id);
      const after = asObject(p.after);
      const versionAfter = asNumber(p.version_after);
      if (!planId || !bucketId || !after) return;
      qc.setQueryData<BucketRow[]>(bucketsKey(planId), (prev) => {
        if (!prev) return prev;
        return prev.map((b) => {
          if (b.id !== bucketId) return b;
          const name = asString(after.name);
          const sortOrder = asNumber(after.sort_order);
          return {
            ...b,
            ...(name !== undefined ? { name } : {}),
            ...(sortOrder !== undefined ? { sort_order: sortOrder } : {}),
            ...(versionAfter !== undefined ? { version: versionAfter } : {}),
          };
        });
      });
      return;
    }

    case 'planner.bucket.deleted': {
      const bucketId = asString(p.bucket_id);
      if (!planId || !bucketId) return;
      qc.setQueryData<BucketRow[]>(bucketsKey(planId), (prev) =>
        prev ? prev.filter((b) => b.id !== bucketId) : prev,
      );
      // Deletion server-side reflows sort_order on the affected tasks; safest to refetch the list.
      qc.invalidateQueries({ queryKey: tasksKey(planId) });
      return;
    }

    case 'planner.task.created': {
      const after = asObject(p.after);
      const afterPlan = after && asString(after.plan_id);
      const id = after && asString(after.task_id);
      if (!after || !afterPlan || !id) return;
      qc.setQueryData<TaskWithAssigneesRow[]>(tasksKey(afterPlan), (prev) => {
        if (!prev) return prev;
        if (prev.some((t) => t.id === id)) return prev;
        const now = new Date().toISOString();
        const fresh: TaskWithAssigneesRow = {
          id,
          tenant_id: event.tenantId,
          plan_id: afterPlan,
          bucket_id: asString(after.bucket_id) ?? null,
          title: asString(after.title) ?? '',
          description: asString(after.description) ?? null,
          // Why: payload `priority` is the union literal, but we read it through unknown.
          priority: (asString(after.priority) as TaskWithAssigneesRow['priority']) ?? 'medium',
          progress: 'not_started',
          review_state:
            (asString(after.review_state) as TaskWithAssigneesRow['review_state']) ?? null,
          skill_tags: Array.isArray(after.skill_tags) ? (after.skill_tags as string[]) : [],
          due_at: asString(after.due_at) ?? null,
          sort_order: asNumber(after.sort_order) ?? 0,
          created_by: asString(after.created_by) ?? '',
          created_at: now,
          updated_at: now,
          deleted_at: null,
          version: 1,
          assignees: [],
          labels: [],
          checklist_summary: { total: 0, checked: 0 },
        };
        return [...prev, fresh];
      });
      return;
    }

    case 'planner.task.updated': {
      const after = asObject(p.after);
      const versionAfter = asNumber(p.version_after);
      if (!planId || !taskId || !after) return;
      qc.setQueryData<TaskWithAssigneesRow[]>(tasksKey(planId), (prev) => {
        if (!prev) return prev;
        return prev.map((t) => (t.id === taskId ? mergeTaskPatch(t, after, versionAfter) : t));
      });
      return;
    }

    case 'planner.task.moved': {
      const after = asObject(p.after);
      const versionAfter = asNumber(p.version_after);
      if (!planId || !taskId || !after) return;
      useRecentlyMovedTasks.getState().mark(taskId);
      const newBucket = 'bucket_id' in after ? (asString(after.bucket_id) ?? null) : undefined;
      const newSort = asNumber(after.sort_order);
      qc.setQueryData<TaskWithAssigneesRow[]>(tasksKey(planId), (prev) => {
        if (!prev) return prev;
        return prev.map((t) => {
          if (t.id !== taskId) return t;
          return {
            ...t,
            ...(newBucket !== undefined ? { bucket_id: newBucket } : {}),
            ...(newSort !== undefined ? { sort_order: newSort } : {}),
            ...(versionAfter !== undefined ? { version: versionAfter } : {}),
          };
        });
      });
      return;
    }

    case 'planner.task.assigned': {
      const userId = asString(p.user_id);
      if (!planId || !taskId || !userId) return;
      qc.setQueryData<TaskWithAssigneesRow[]>(tasksKey(planId), (prev) => {
        if (!prev) return prev;
        return prev.map((t) => {
          if (t.id !== taskId) return t;
          if (t.assignees.some((a) => a.user_id === userId)) return t;
          return {
            ...t,
            assignees: [
              ...t.assignees,
              {
                user_id: userId,
                // Placeholder; the single-task invalidation below repopulates the real display name.
                display_name: '…',
                email: '',
                availability_status: 'available',
                ooo_until: null,
                deactivated_at: null,
              },
            ],
          };
        });
      });
      qc.invalidateQueries({ queryKey: plannerKeys.task(taskId) });
      return;
    }

    case 'planner.task.unassigned': {
      const userId = asString(p.user_id);
      if (!planId || !taskId || !userId) return;
      qc.setQueryData<TaskWithAssigneesRow[]>(tasksKey(planId), (prev) => {
        if (!prev) return prev;
        return prev.map((t) =>
          t.id === taskId
            ? { ...t, assignees: t.assignees.filter((a) => a.user_id !== userId) }
            : t,
        );
      });
      qc.invalidateQueries({ queryKey: plannerKeys.task(taskId) });
      return;
    }

    case 'planner.task.completed': {
      const versionAfter = asNumber(p.version_after);
      if (!planId || !taskId) return;
      qc.setQueryData<TaskWithAssigneesRow[]>(tasksKey(planId), (prev) => {
        if (!prev) return prev;
        return prev.map((t) =>
          t.id === taskId
            ? { ...t, progress: 'completed', ...(versionAfter ? { version: versionAfter } : {}) }
            : t,
        );
      });
      return;
    }

    case 'planner.task.reopened': {
      const versionAfter = asNumber(p.version_after);
      if (!planId || !taskId) return;
      qc.setQueryData<TaskWithAssigneesRow[]>(tasksKey(planId), (prev) => {
        if (!prev) return prev;
        return prev.map((t) =>
          t.id === taskId
            ? { ...t, progress: 'not_started', ...(versionAfter ? { version: versionAfter } : {}) }
            : t,
        );
      });
      return;
    }

    case 'planner.task.deleted': {
      if (!planId || !taskId) return;
      qc.setQueryData<TaskWithAssigneesRow[]>(tasksKey(planId), (prev) =>
        prev ? prev.filter((t) => t.id !== taskId) : prev,
      );
      qc.invalidateQueries({ queryKey: plannerKeys.trash() });
      return;
    }

    case 'planner.task.restored': {
      if (!planId || !taskId) return;
      // Restored tasks aren't in the live cache (they were filtered out); refetch to pick them up.
      qc.invalidateQueries({ queryKey: tasksKey(planId) });
      qc.invalidateQueries({ queryKey: plannerKeys.trash() });
      return;
    }

    case 'planner.checklist_item.added':
    case 'planner.checklist_item.updated':
    case 'planner.checklist_item.removed':
      if (taskId) {
        qc.invalidateQueries({ queryKey: plannerKeys.taskChecklist(taskId) });
        qc.invalidateQueries({ queryKey: plannerKeys.taskEvents(taskId) });
      }
      return;

    case 'planner.label.created':
    case 'planner.label.updated':
    case 'planner.label.deleted':
      if (planId) qc.invalidateQueries({ queryKey: plannerKeys.planLabels(planId) });
      return;

    case 'planner.label.applied':
    case 'planner.label.unapplied':
      if (taskId) qc.invalidateQueries({ queryKey: plannerKeys.task(taskId) });
      if (planId) qc.invalidateQueries({ queryKey: plannerKeys.plan(planId) });
      return;
  }
}

function mergeTaskPatch(
  task: TaskWithAssigneesRow,
  after: Record<string, unknown>,
  versionAfter: number | undefined,
): TaskWithAssigneesRow {
  // Why: payload values arrive as `unknown`; we narrow per-field via the helpers and copy
  // only the fields actually present in `after`, matching the server's Partial<TaskMutableFields>.
  const patch: Partial<TaskWithAssigneesRow> = {};
  if ('title' in after) {
    const v = asString(after.title);
    if (v !== undefined) patch.title = v;
  }
  if ('description' in after) {
    const v = after.description;
    patch.description = typeof v === 'string' ? v : null;
  }
  if ('priority' in after) {
    const v = asString(after.priority);
    if (v !== undefined) patch.priority = v as TaskWithAssigneesRow['priority'];
  }
  if ('due_at' in after) {
    const v = after.due_at;
    patch.due_at = typeof v === 'string' ? v : null;
  }
  if ('skill_tags' in after && Array.isArray(after.skill_tags)) {
    patch.skill_tags = after.skill_tags as string[];
  }
  if ('review_state' in after) {
    const v = after.review_state;
    patch.review_state = v === 'needs_review' ? 'needs_review' : null;
  }
  if ('progress' in after) {
    const v = asString(after.progress);
    if (v !== undefined) patch.progress = v as TaskWithAssigneesRow['progress'];
  }
  if ('bucket_id' in after) {
    const v = after.bucket_id;
    patch.bucket_id = typeof v === 'string' ? v : null;
  }
  return {
    ...task,
    ...patch,
    ...(versionAfter !== undefined ? { version: versionAfter } : {}),
  };
}
