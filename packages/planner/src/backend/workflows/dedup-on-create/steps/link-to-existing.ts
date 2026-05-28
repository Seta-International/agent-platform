import type { SessionScope } from '@seta/core';
import { addTaskReference } from '../../../domain/add-task-reference.ts';
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
  await addTaskReference({
    task_id: input.taskId,
    url: `seta://planner/tasks/${input.existingId}`,
    alias: `Related: existing task ${input.existingId.slice(0, 8)}`,
    type: 'link',
    session: input.session,
  });
  return { kind: 'linked', taskId: input.taskId, linkedTo: [input.existingId] };
}
