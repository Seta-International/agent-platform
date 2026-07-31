import type { SpecializedAgentRunCtx } from '@seta/agent-sdk';
import type { AvailabilityStatus } from './schemas.ts';

export interface TaskInfo {
  taskId: string;
  title: string;
  description: string | null;
  groupId: string;
  /** The task's own label names (authoritative skills source for the analyzer). */
  labels: string[];
}

/** Reads a planner task (adapter wraps planner's public getTask). */
export interface TaskReaderPort {
  load(taskId: string, ctx: SpecializedAgentRunCtx): Promise<TaskInfo | null>;
}

/** A task surfaced by a label search (find_tasks intent). */
export interface TaskSummary {
  taskId: string;
  title: string;
  status: 'not_started' | 'in_progress' | 'completed';
  labels: string[];
}

/** Deterministic label-name task search (adapter wraps planner listTasksByLabel). */
export interface TaskSearchPort {
  byLabels(
    names: string[],
    limit: number,
    ctx: SpecializedAgentRunCtx,
    completionStatus?: 'open' | 'completed' | 'any',
  ): Promise<TaskSummary[]>;
  /** All distinct lowercase label names used by non-deleted tasks in the caller's tenant. */
  listAvailableLabels(ctx: SpecializedAgentRunCtx): Promise<string[]>;
}

export interface SkillSearchHit {
  userId: string;
  name: string | null;
  skills: string[];
  role: string | null;
  similarity: number;
}

/** Vector search over identity skill embeddings (adapter wraps identity search). */
export interface SkillSearchPort {
  search(
    args: { skills: string[]; topK: number },
    ctx: SpecializedAgentRunCtx,
  ): Promise<SkillSearchHit[]>;
}

export interface UserProfileHit {
  userId: string;
  name: string;
  role: string | null;
  skills: string[];
  availability: AvailabilityStatus;
}

/** Looks up a user's profile by display-name substring (adapter wraps identity listUsers). */
export interface UserProfilePort {
  findByName(name: string, ctx: SpecializedAgentRunCtx, limit?: number): Promise<UserProfileHit[]>;
}

/** Availability signals (adapter wraps identity profile + planner in-progress count). */
export interface AvailabilityPort {
  status(
    userId: string,
    ctx: SpecializedAgentRunCtx,
  ): Promise<{ status: AvailabilityStatus; name?: string | null; note: string | null }>;
  inProgressCount(userId: string, ctx: SpecializedAgentRunCtx): Promise<number>;
}

/** Resolves the user_ids already assigned to a task, so the pipeline can exclude
 *  them from suggestions (proposing someone already on the task is noise). Wired
 *  by the app to planner's task_assignments read. */
export interface TaskAssigneesPort {
  /** user_ids currently assigned to the task. Empty when none / task unresolved. */
  currentAssigneeIds(taskId: string, ctx: SpecializedAgentRunCtx): Promise<string[]>;
}

/** Performs the assignment a proposeAssignment card approves. Wired by the app
 *  to planner's public assignTask surface (RBAC re-checked at the callee). */
export interface AssignPort {
  assign(opts: {
    taskId: string;
    assigneeUserIds: string[];
    tenantId: string;
    actorUserId: string;
    /** Gates the write: a replay of the same key returns the prior result instead
     *  of assigning again. Required — every governed write declares one. */
    idempotencyKey: string;
  }): Promise<void>;
}
