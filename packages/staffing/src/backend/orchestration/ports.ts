import type { SpecializedAgentRunCtx } from '@seta/agent-sdk';
import type { AvailabilityStatus } from './schemas.ts';

export interface TaskInfo {
  taskId: string;
  title: string;
  description: string | null;
  groupId: string;
  /** The task's own skill_tags (authoritative skills source for the analyzer). */
  skillTags: string[];
}

/** Reads a planner task (adapter wraps planner's public getTask). */
export interface TaskReaderPort {
  load(taskId: string, ctx: SpecializedAgentRunCtx): Promise<TaskInfo | null>;
}

/** A task surfaced by a skill-tag search (find_tasks intent). */
export interface TaskSummary {
  taskId: string;
  title: string;
  status: 'not_started' | 'in_progress' | 'completed';
  skillTags: string[];
}

/** Deterministic skill-tag task search (adapter wraps planner listTasksBySkillTag). */
export interface TaskSearchPort {
  bySkillTags(
    tags: string[],
    limit: number,
    ctx: SpecializedAgentRunCtx,
    completionStatus?: 'open' | 'completed' | 'any',
  ): Promise<TaskSummary[]>;
  /** All distinct lowercase skill tags used by non-deleted tasks in the caller's tenant. */
  listAvailableTags(ctx: SpecializedAgentRunCtx): Promise<string[]>;
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

/** Availability signals (adapter wraps identity profile + planner in-progress count). */
export interface AvailabilityPort {
  status(
    userId: string,
    ctx: SpecializedAgentRunCtx,
  ): Promise<{ status: AvailabilityStatus; name?: string | null; note: string | null }>;
  inProgressCount(userId: string, ctx: SpecializedAgentRunCtx): Promise<number>;
}
