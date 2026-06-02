import type { SpecializedAgentRunCtx } from '@seta/agent-sdk';
import type { AvailabilityStatus } from './schemas.ts';

export interface TaskInfo {
  taskId: string;
  title: string;
  description: string | null;
  groupId: string;
}

/** Reads a planner task (adapter wraps planner's public getTask). */
export interface TaskReaderPort {
  load(taskId: string, ctx: SpecializedAgentRunCtx): Promise<TaskInfo | null>;
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

/** Availability signals (adapter wraps identity leave + planner in-progress count). */
export interface AvailabilityPort {
  status(
    userId: string,
    ctx: SpecializedAgentRunCtx,
  ): Promise<{ status: AvailabilityStatus; note: string | null }>;
  inProgressCount(userId: string, ctx: SpecializedAgentRunCtx): Promise<number>;
}
