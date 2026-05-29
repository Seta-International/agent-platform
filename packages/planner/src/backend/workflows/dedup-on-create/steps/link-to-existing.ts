import type { SessionScope } from '@seta/core';
import { addTaskReference } from '../../../domain/add-task-reference.ts';
import { getTask } from '../../../domain/get-task.ts';
import type { DedupOutput } from '../schemas.ts';

export interface LinkToExistingInput {
  taskId: string;
  existingId: string;
  session: SessionScope;
}

/**
 * Persist the user's HITL choice: mark the new task as related to an existing one.
 * Adds a task_reference on the new task pointing to the existing task.
 */
export async function linkToExisting(input: LinkToExistingInput): Promise<DedupOutput> {
  const existing = await getTask({ task_id: input.existingId, session: input.session });
  await addTaskReference({
    task_id: input.taskId,
    url: `/planner/plans/${existing.plan_id}/tasks/${input.existingId}`,
    alias: `Related: ${existing.title}`,
    type: 'link',
    session: input.session,
  });
  return { kind: 'linked', taskId: input.taskId, linkedTo: [input.existingId] };
}
