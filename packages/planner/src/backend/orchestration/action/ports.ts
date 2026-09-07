import type {
  ActionTaskSnapshot,
  ToolTaskLinkKind,
  UpdateTaskActionPatch,
  UpdateTaskTarget,
} from './schemas.ts';

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

export interface TaskLinkPort {
  /**
   * Reads an endpoint for a LINK preview. `FORBIDDEN`, `NOT_FOUND` and
   * `CROSS_TENANT` all collapse into ONE `null`, so "you don't have access to
   * that task" can never be distinguished from "no such task" — FUT-805 AC3.
   *
   * Normalised HERE and not in `getTask`: doing it at the source would flip the
   * HTTP layer from 403 to 404 for web-planner and every existing assertion.
   */
  readEndpoint(args: ActorRef & { taskId: string }): Promise<ActionTaskSnapshot | null>;

  /** `planner.task.update` on every group given, once per distinct group. */
  assertCanLink(args: ActorRef & { groupIds: string[] }): Promise<void>;

  /**
   * What relationship this PAIR already carries, in either direction, or null.
   *
   * Not a boolean: a pair-direction holds one kind at a time (design D8), so the
   * tool has to be able to NAME what is there — "already marked as duplicates,
   * remove that first" is a different sentence from "already linked that way".
   * Checked before the card is built, so an existing relationship is an answer
   * rather than a card that fails at Confirm.
   */
  readPairLink(
    args: ActorRef & { sourceTaskId: string; targetTaskId: string },
  ): Promise<{ kind: ToolTaskLinkKind; direction: 'outgoing' | 'incoming' } | null>;

  /** The governed write: `withGatedMutation('link')` around `linkTasks`. */
  link(
    args: ActorRef & {
      sourceTaskId: string;
      targetTaskId: string;
      kind: ToolTaskLinkKind;
      idempotencyKey: string;
    },
  ): Promise<{ linkId: string; replayed: boolean }>;
}

export interface TaskMergePort {
  /**
   * Three checks, not two: `planner.task.update` on BOTH groups (a link touches
   * both) plus `planner.task.delete` on the duplicate's group. An actor who may
   * link but not delete is refused before the card, never at Confirm.
   */
  assertCanMerge(args: ActorRef & { duplicateGroupId: string; keepGroupId: string }): Promise<void>;

  /** Link + soft-delete in ONE gated transaction. Partial success here would
   *  leave a task in the trash with nothing pointing at where its content went. */
  merge(
    args: ActorRef & {
      duplicateTaskId: string;
      duplicateExpectedVersion: number;
      keepTaskId: string;
      idempotencyKey: string;
    },
  ): Promise<{ replayed: boolean }>;
}

export interface TaskAssignPort {
  /**
   * The card's "before" half: the task's title, its group, and the CURRENT
   * assignee set with display names. Null when the task is absent or the actor
   * cannot read it — the same collapse `TaskLinkPort.readEndpoint` makes, for
   * the same reason.
   */
  readForAssign(args: ActorRef & { taskId: string }): Promise<{
    title: string;
    groupId: string;
    assignees: Array<{ userId: string; name: string }>;
  } | null>;

  /** `planner.task.assign` on the task's group. The load-bearing first-pass
   *  gate: `defineAgentTool({ rbac })` is declarative metadata whose only
   *  readers are tests, so without this a viewer would build a card and write a
   *  pending approval row before anything refused them. */
  assertCanAssign(args: ActorRef & { groupId: string }): Promise<void>;

  /**
   * People matching a name fragment, with whether they are in the task's group.
   * Returns ALL matches: deciding between two people called "Tuan" is the tool's
   * job (it refuses and lists them), not this port's.
   */
  resolveMembers(
    args: ActorRef & { query: string; groupId: string },
  ): Promise<Array<{ userId: string; name: string; inGroup: boolean }>>;

  /**
   * The governed write: `withGatedMutation('assign')` around `setAssignees`,
   * which REPLACES the set.
   *
   * Deliberately NOT the assignment runtime's `AssignPort`: that one loops
   * `assignTask`, which inserts ON CONFLICT DO NOTHING and therefore only ever
   * ADDS. The recommend flow wants adding (its candidates exclude whoever is
   * already assigned); this tool wants the set the user named to be the set that
   * is true, which is design D5.
   */
  assign(
    args: ActorRef & { taskId: string; assigneeUserIds: string[]; idempotencyKey: string },
  ): Promise<{ replayed: boolean }>;
}

export interface ActionPorts {
  taskRead: TaskReadPort;
  taskUpdate: TaskUpdatePort;
  taskLink: TaskLinkPort;
  taskMerge: TaskMergePort;
  taskAssign: TaskAssignPort;
}
