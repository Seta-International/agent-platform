import type { SessionScope } from '@seta/core';
import { linkTasks } from '../../../domain/link-tasks.ts';
import type { DedupOutput } from '../schemas.ts';

export interface LinkToExistingInput {
  taskId: string;
  existingId: string;
  session: SessionScope;
}

/**
 * Persist the user's HITL choice: mark the new task as related to an existing one.
 *
 * Writes a real `planner.task_links` row. It used to write a `task_reference`
 * whose URL was `/planner/plans/<planId>/tasks/<taskId>` — a route path as the
 * identity of a domain relationship, which rots the moment the target moves to
 * another plan (design §0.2).
 *
 * The old `getTask` read-gate on the target is gone because `linkTasks` gates the
 * target harder: it requires `planner.task.update` on the target's group, where
 * `getTask` required only `planner.task.read`.
 */
export async function linkToExisting(input: LinkToExistingInput): Promise<DedupOutput> {
  await linkTasks({
    source_task_id: input.taskId,
    target_task_id: input.existingId,
    kind: 'relates',
    session: input.session,
  });
  return { kind: 'linked', taskId: input.taskId, linkedTo: [input.existingId] };
}
