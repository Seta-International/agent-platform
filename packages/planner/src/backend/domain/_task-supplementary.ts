// Shared per-task fan-out joins used by list endpoints that return assignees + labels
// (`list-tasks`, `list-my-tasks`). Kept in its own module so neither list-domain
// imports the other.

import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { plannerDb } from '../db/index.ts';
import { assigneeProjection, labels, taskAssignments, taskLabels } from '../db/schema.ts';
import type { AssigneeRow, LabelRow } from '../dto.ts';

export interface TaskSupplementaryMaps {
  assigneesByTaskId: Map<string, AssigneeRow[]>;
  labelsByTaskId: Map<string, LabelRow[]>;
}

/**
 * Fetch assignees + labels for a set of task ids in parallel and return them
 * as id-keyed maps ready to stitch onto base task rows.
 *
 * Returns empty maps when `taskIds` is empty — callers don't need a guard.
 */
export async function fetchAssigneesAndLabels(
  db: ReturnType<typeof plannerDb>,
  taskIds: string[],
): Promise<TaskSupplementaryMaps> {
  if (taskIds.length === 0) {
    return { assigneesByTaskId: new Map(), labelsByTaskId: new Map() };
  }

  const [assigneeRows, labelRows] = await Promise.all([
    db
      .select({
        task_id: taskAssignments.task_id,
        user_id: taskAssignments.user_id,
        display_name: assigneeProjection.display_name,
        email: assigneeProjection.email,
        availability_status: assigneeProjection.availability_status,
        ooo_until: assigneeProjection.ooo_until,
        deactivated_at: assigneeProjection.deactivated_at,
      })
      .from(taskAssignments)
      .innerJoin(assigneeProjection, eq(assigneeProjection.user_id, taskAssignments.user_id))
      .where(inArray(taskAssignments.task_id, taskIds)),

    db
      .select({
        task_id: taskLabels.task_id,
        id: labels.id,
        tenant_id: labels.tenant_id,
        plan_id: labels.plan_id,
        name: labels.name,
        color: labels.color,
        category_slot: labels.category_slot,
        created_at: labels.created_at,
        deleted_at: labels.deleted_at,
      })
      .from(taskLabels)
      .innerJoin(labels, eq(labels.id, taskLabels.label_id))
      .where(and(inArray(taskLabels.task_id, taskIds), isNull(labels.deleted_at))),
  ]);

  const assigneesByTaskId = new Map<string, AssigneeRow[]>();
  for (const r of assigneeRows) {
    const list = assigneesByTaskId.get(r.task_id) ?? [];
    list.push({
      user_id: r.user_id,
      display_name: r.display_name,
      email: r.email,
      availability_status: r.availability_status,
      ooo_until: r.ooo_until ? r.ooo_until.toISOString() : null,
      deactivated_at: r.deactivated_at ? r.deactivated_at.toISOString() : null,
    });
    assigneesByTaskId.set(r.task_id, list);
  }

  const labelsByTaskId = new Map<string, LabelRow[]>();
  for (const r of labelRows) {
    const list = labelsByTaskId.get(r.task_id) ?? [];
    list.push({
      id: r.id,
      tenant_id: r.tenant_id,
      plan_id: r.plan_id,
      name: r.name,
      color: r.color,
      category_slot: r.category_slot,
      created_at: r.created_at.toISOString(),
      deleted_at: r.deleted_at ? r.deleted_at.toISOString() : null,
    });
    labelsByTaskId.set(r.task_id, list);
  }

  return { assigneesByTaskId, labelsByTaskId };
}
