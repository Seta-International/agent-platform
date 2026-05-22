import type { tasks } from '../../db/schema.ts';
import type { TaskExternalSource, TaskPreviewType, TaskPriorityNumber, TaskRow } from '../dto.ts';

type TaskDbRow = typeof tasks.$inferSelect;

export function taskRowToDto(row: TaskDbRow): TaskRow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    plan_id: row.plan_id,
    bucket_id: row.bucket_id,
    title: row.title,
    description: row.description,
    priority_number: row.priority_number as TaskPriorityNumber,
    percent_complete: row.percent_complete,
    is_deferred: row.is_deferred,
    preview_type: row.preview_type as TaskPreviewType,
    review_state: row.review_state,
    skill_tags: row.skill_tags,
    start_at: row.start_at?.toISOString() ?? null,
    due_at: row.due_at?.toISOString() ?? null,
    order_hint: row.order_hint,
    assignee_priority: row.assignee_priority,
    external_source: row.external_source as TaskExternalSource,
    external_id: row.external_id,
    external_etag: row.external_etag,
    external_synced_at: row.external_synced_at?.toISOString() ?? null,
    sync_status: row.sync_status as TaskRow['sync_status'],
    last_error: row.last_error,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    deleted_at: row.deleted_at?.toISOString() ?? null,
    version: row.version,
  };
}
