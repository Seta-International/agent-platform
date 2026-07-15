import { Mutex } from 'async-mutex';
import { getConversationMemory } from './conversation-memory.ts';
import { RC_THREAD_ID } from './request-context.ts';
import {
  type ConversationEntities,
  parseEntities,
  type RecentTask,
  serializeEntities,
} from './working-memory-schema.ts';

type ToolExecuteCtx = {
  agent?: { threadId?: string; resourceId?: string };
  requestContext?: { get: (k: string) => unknown };
};

export type EntityPatch = Partial<{
  recentTasks: Array<{ taskId: string; title: string }>;
  lastDiscussedTaskId: string | null;
  lastProposedCandidateUserId: string | null;
  pendingDecision: ConversationEntities['pendingDecision'];
  rejectedCandidates: ConversationEntities['rejectedCandidates'];
  recentDocuments: Array<{ documentId: string; title: string; lastSeenAt: string }>;
  lastDiscussedDocumentId: string | null;
}>;

// Local mutex map mirrors Mastra's per-thread serialization. We need our own
// because Mastra's mutex only wraps its updateWorkingMemory call, not our
// read-merge-write window. Keyed on the chat thread id because conversation
// entities are thread-scoped.
const mutexes = new Map<string, Mutex>();

function getMutex(key: string): Mutex {
  const existing = mutexes.get(key);
  if (existing) return existing;
  const fresh = new Mutex();
  mutexes.set(key, fresh);
  return fresh;
}

// The real chat thread id — set by the chat route under RC_THREAD_ID and
// propagated into sub-agent tool calls. We deliberately do NOT fall back to
// ctx.agent.threadId: Mastra randomizes that per delegation, which would shard
// entity state into ephemeral sub-threads.
function readThreadId(ctx: ToolExecuteCtx): string | undefined {
  const raw = ctx.requestContext?.get(RC_THREAD_ID);
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

export async function recordEntityExposure(ctx: ToolExecuteCtx, patch: EntityPatch): Promise<void> {
  const handle = getConversationMemory();
  if (!handle) return; // workflow/cron path — no chat memory
  const threadId = readThreadId(ctx);
  if (!threadId) return; // no conversation context (e.g. very first turn before id minted)

  const release = await getMutex(threadId).acquire();
  try {
    const raw = await handle.memory.getWorkingMemory({
      threadId,
      memoryConfig: handle.memoryConfig,
    });
    const current = parseEntities(raw);
    const next = mergeEntities(current, patch);
    await handle.memory.updateWorkingMemory({
      threadId,
      workingMemory: serializeEntities(next),
      memoryConfig: handle.memoryConfig,
    });
  } catch {
    // Exposure tracking is best-effort — never let it break the tool's actual
    // operation (e.g. thread row not yet persisted on the very first turn).
  } finally {
    release();
  }
}

function mergeEntities(current: ConversationEntities, patch: EntityPatch): ConversationEntities {
  const now = new Date().toISOString();
  const next: ConversationEntities = { ...current };

  if (patch.recentTasks) {
    next.recentTasks = mergeRecentTasks(current.recentTasks, patch.recentTasks, now);
  }
  if (patch.lastDiscussedTaskId !== undefined) next.lastDiscussedTaskId = patch.lastDiscussedTaskId;
  if (patch.lastProposedCandidateUserId !== undefined) {
    next.lastProposedCandidateUserId = patch.lastProposedCandidateUserId;
  }
  if (patch.pendingDecision !== undefined) next.pendingDecision = patch.pendingDecision;
  if (patch.rejectedCandidates !== undefined) next.rejectedCandidates = patch.rejectedCandidates;
  if (patch.recentDocuments) {
    const seen = new Set<string>();
    const merged = [...patch.recentDocuments, ...(current.recentDocuments ?? [])];
    next.recentDocuments = merged
      .filter((d) => {
        if (seen.has(d.documentId)) return false;
        seen.add(d.documentId);
        return true;
      })
      .slice(0, 10);
  }
  if (patch.lastDiscussedDocumentId !== undefined) {
    next.lastDiscussedDocumentId = patch.lastDiscussedDocumentId;
  }
  return next;
}

function mergeRecentTasks(
  existing: ReadonlyArray<RecentTask>,
  incoming: ReadonlyArray<{ taskId: string; title: string }>,
  now: string,
): RecentTask[] {
  // incomingIdx tracks position in the incoming array for stable tiebreaking:
  // lower index = appeared earlier in the batch = sorted first among same-timestamp entries.
  const incomingIdx = new Map<string, number>();
  let idx = 0;
  for (const t of incoming) {
    incomingIdx.set(t.taskId, idx);
    idx++;
  }

  const byId = new Map<string, RecentTask>();
  for (const t of existing) byId.set(t.taskId, t);
  for (const t of incoming)
    byId.set(t.taskId, { taskId: t.taskId, title: t.title, lastSeenAt: now });

  return [...byId.values()]
    .sort((a, b) => {
      const timeDiff = b.lastSeenAt.localeCompare(a.lastSeenAt);
      if (timeDiff !== 0) return timeDiff;
      // Within same timestamp (same batch), preserve incoming array order.
      const ia = incomingIdx.get(a.taskId) ?? Infinity;
      const ib = incomingIdx.get(b.taskId) ?? Infinity;
      return ia - ib;
    })
    .slice(0, 10);
}

// Test-only escape hatch — never call from production code.
export function __resetMutexesForTests(): void {
  mutexes.clear();
}
