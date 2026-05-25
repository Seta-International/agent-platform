import type { SessionScope } from '@seta/core';
import { addChecklistItem } from '../../../domain/add-checklist-item.ts';
import { addTaskReference } from '../../../domain/add-task-reference.ts';
import { createTask } from '../../../domain/create-task.ts';
import type { DedupOutput, LinkMode, TaskDraft } from '../schemas.ts';

export interface LinkToExistingInput {
  existingId: string;
  mode: LinkMode;
  draft: TaskDraft;
  session: SessionScope;
}

/**
 * Persist the user's HITL choice when they confirmed a dedup match.
 *
 *   'related'  → create the new task and add a task_reference on it pointing
 *                back to the existing task (MS Planner-native reference shape).
 *   'sub-task' → add a checklist_item on the existing task labeled with the
 *                draft's title; no new task is created. Matches MS Planner's
 *                lack of true task-to-task hierarchy.
 */
export async function linkToExisting(
  input: LinkToExistingInput,
): Promise<Extract<DedupOutput, { kind: 'created' | 'sub-task-added' }>> {
  if (input.mode === 'sub-task') {
    const item = await addChecklistItem({
      task_id: input.existingId,
      label: input.draft.title,
      session: input.session,
    });
    return { kind: 'sub-task-added', existingId: input.existingId, checklistItemId: item.id };
  }

  // 'related'
  if (!input.draft.plan_id) {
    throw new Error('linkToExisting(related): draft.plan_id is required to create the new task');
  }
  const newTask = await createTask({
    session: input.session,
    plan_id: input.draft.plan_id,
    bucket_id: input.draft.bucket_id,
    title: input.draft.title,
    description: input.draft.description,
    skill_tags: input.draft.skill_tags,
  });
  await addTaskReference({
    task_id: newTask.id,
    url: `seta://planner/tasks/${input.existingId}`,
    alias: `Related: original task ${input.existingId.slice(0, 8)}`,
    type: 'link',
    session: input.session,
  });
  return { kind: 'created', taskId: newTask.id, linkedTo: input.existingId };
}
