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
 * Writes a typed `planner.task_references` link row — `type = 'relates'`, url =
 * the target's plan-free canonical path. It used to build
 * `/planner/plans/<planId>/tasks/<taskId>` by hand, a route path as the identity
 * of a domain relationship, which rots the moment the target moves to another
 * plan (design §0.2).
 *
 * The old `getTask` read-gate on the target is gone because `linkTasks` gates it
 * harder: `planner.task.update` on the target's group, where `getTask` required
 * only `planner.task.read` (§3.4).
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
