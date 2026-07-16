import { z } from 'zod';

// ───────────────────────────────────────────────────────────────────────────
// User context — soft, LLM-curated facts about the user.
//
// RESOURCE-scoped: persists across all of a user's conversations. This IS the
// Mastra working memory injected into the agent's prompt and editable by the
// model via the (guarded) updateWorkingMemory tool.
// ───────────────────────────────────────────────────────────────────────────
export const WorkingMemoryUserContextSchema = z.object({
  timezone: z.string().nullable(),
  communicationStyle: z.string().nullable(),
  currentFocus: z.string().nullable(),
  preferredTaskView: z.string().nullable(),
  notes: z.string().nullable(),
});

export const WorkingMemorySchema = z.object({
  userContext: WorkingMemoryUserContextSchema,
});

export type WorkingMemory = z.infer<typeof WorkingMemorySchema>;

export const EMPTY_WORKING_MEMORY: WorkingMemory = {
  userContext: {
    timezone: null,
    communicationStyle: null,
    currentFocus: null,
    preferredTaskView: null,
    notes: null,
  },
};

export function parseWorkingMemory(raw: string | null | undefined): WorkingMemory {
  if (!raw) return EMPTY_WORKING_MEMORY;
  try {
    const result = WorkingMemorySchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : EMPTY_WORKING_MEMORY;
  } catch {
    return EMPTY_WORKING_MEMORY;
  }
}

export function serializeWorkingMemory(wm: WorkingMemory): string {
  return JSON.stringify(wm);
}

// ───────────────────────────────────────────────────────────────────────────
// Conversation entities — server-owned operational state for task-ref
// resolution ("the first one", "that task", "the one we just discussed").
//
// THREAD-scoped: isolated per conversation, keyed on the real chat thread id.
// NEVER injected into the LLM prompt and never written by the model — only the
// entity recorder (write) and the task-ref resolver (read) touch it. Kept out
// of WorkingMemorySchema on purpose: these are per-conversation UUIDs, not
// per-user facts, and leaking them across conversations made the agent anchor
// on stale tasks.
// ───────────────────────────────────────────────────────────────────────────
export const RecentTaskSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().min(1),
  lastSeenAt: z.string().datetime(),
});

export const RecentDocumentSchema = z.object({
  documentId: z.string().uuid(),
  title: z.string().min(1),
  lastSeenAt: z.string().datetime(),
});

export const ConversationEntitiesSchema = z.object({
  recentTasks: z.array(RecentTaskSchema).max(10),
  lastDiscussedTaskId: z.string().uuid().nullable(),
  lastProposedCandidateUserId: z.string().uuid().nullable(),
  pendingDecision: z.object({ taskId: z.string().uuid(), userId: z.string().uuid() }).nullable(),
  rejectedCandidates: z
    .array(z.object({ taskId: z.string().uuid(), userId: z.string().uuid() }))
    .max(20),
  recentDocuments: z.array(RecentDocumentSchema).max(10),
  lastDiscussedDocumentId: z.string().uuid().nullable(),
});

export type ConversationEntities = z.infer<typeof ConversationEntitiesSchema>;
export type RecentTask = z.infer<typeof RecentTaskSchema>;

export const EMPTY_ENTITIES: ConversationEntities = {
  recentTasks: [],
  lastDiscussedTaskId: null,
  lastProposedCandidateUserId: null,
  pendingDecision: null,
  rejectedCandidates: [],
  recentDocuments: [],
  lastDiscussedDocumentId: null,
};

export function parseEntities(raw: string | null | undefined): ConversationEntities {
  if (!raw) return EMPTY_ENTITIES;
  try {
    const result = ConversationEntitiesSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : EMPTY_ENTITIES;
  } catch {
    return EMPTY_ENTITIES;
  }
}

export function serializeEntities(entities: ConversationEntities): string {
  return JSON.stringify(entities);
}
