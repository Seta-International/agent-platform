import type { ActionTaskSnapshot, UpdateTaskActionPatch } from './schemas.ts';

export interface ActorRef {
  tenantId: string;
  actorUserId: string;
}

export interface TaskReadPort {
  /** Current values + `version`, resolved for this actor. Throws the planner's
   *  own NOT_FOUND / CROSS_TENANT errors for a task the actor cannot see. */
  read(args: ActorRef & { taskId: string }): Promise<ActionTaskSnapshot>;
}

export interface TaskUpdatePort {
  /**
   * First-pass permission gate. `defineAgentTool({ rbac })` is metadata only —
   * `registerToolPermission` writes a WeakMap whose only readers are tests
   * (`sdks/agent/src/rbac.ts`) — so without this call a `planner.viewer` turn
   * would build a card and write a pending approval row before anything refused
   * it. Throws PlannerError('FORBIDDEN').
   */
  assertCanUpdate(args: ActorRef & { taskId: string; groupId: string }): Promise<void>;

  /**
   * The governed write: `withGatedMutation` (idempotency + attribution +
   * before/after snapshot) around the `updateTask` domain function, in ONE
   * transaction. Throws PlannerError('CONFLICT') when `expectedVersion` is stale.
   */
  update(
    args: ActorRef & {
      taskId: string;
      expectedVersion: number;
      patch: UpdateTaskActionPatch;
      idempotencyKey: string;
    },
  ): Promise<{ taskId: string; version: number; replayed: boolean }>;
}

export interface ActionPorts {
  taskRead: TaskReadPort;
  taskUpdate: TaskUpdatePort;
}
