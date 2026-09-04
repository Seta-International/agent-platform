import type { ActionTaskSnapshot, UpdateTaskActionPatch, UpdateTaskTarget } from './schemas.ts';

export interface ActorRef {
  tenantId: string;
  actorUserId: string;
}

export interface TaskReadPort {
  /**
   * Current values + `version` for every target, **in the order asked**, so a
   * card row and its `targets[i]` describe the same task. Throws the planner's
   * own NOT_FOUND / CROSS_TENANT / FORBIDDEN for the first task the actor cannot
   * see — one bad target refuses the batch.
   *
   * Plural rather than a loop over a singular `read`: the adapter resolves the
   * actor session ONCE, and 20 targets inside one LLM turn must not become 20
   * permission resolutions.
   */
  readMany(args: ActorRef & { taskIds: string[] }): Promise<ActionTaskSnapshot[]>;
}

export interface TaskUpdatePort {
  /**
   * First-pass permission gate, once per DISTINCT group. `defineAgentTool({ rbac })`
   * is metadata only — `registerToolPermission` writes a WeakMap whose only
   * readers are tests (`sdks/agent/src/rbac.ts`) — so without this call a
   * `planner.viewer` turn would build a card and write a pending approval row
   * before anything refused it. Throws PlannerError('FORBIDDEN').
   */
  assertCanUpdateMany(args: ActorRef & { groupIds: string[] }): Promise<void>;

  /**
   * The governed write: `withGatedMutation` (idempotency + attribution +
   * before/after snapshot) around N `updateTask` calls, in ONE transaction.
   * Throws PlannerError('CONFLICT') when any `expectedVersion` is stale, which
   * rolls the whole batch back.
   */
  updateMany(
    args: ActorRef & {
      targets: UpdateTaskTarget[];
      patch: UpdateTaskActionPatch;
      idempotencyKey: string;
    },
  ): Promise<{ taskIds: string[]; replayed: boolean }>;
}

export interface ActionPorts {
  taskRead: TaskReadPort;
  taskUpdate: TaskUpdatePort;
}
