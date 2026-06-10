import type { Mastra } from '@mastra/core';
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';
import type { MemoryConfig, MemoryConfigInternal } from '@mastra/core/memory';
import { Memory } from '@mastra/memory';
import { PgVector } from '@mastra/pg';
import {
  ConversationEntitiesSchema,
  WorkingMemorySchema,
  wrapUpdateWorkingMemoryTool,
} from '@seta/agent-sdk';
import { agentEnv } from './env.ts';

// ---------------------------------------------------------------------------
// Working-memory factories for the chat runtime. Two distinct memories share
// one Mastra storage:
//  - buildMemory         → resource-scoped userContext (GuardedMemory). The
//    orchestrator reads it via getSystemMessage and writes through the guarded
//    updateWorkingMemory tool; rows land in agent.mastra_resources.
//  - buildEntitiesMemory → thread-scoped conversation entities. Server-owned
//    task-ref state driven directly by the SDK entity recorder / task-ref
//    resolver, keyed on the real chat thread id. Never exposed to the model.
// ---------------------------------------------------------------------------

// Subclassed so the LLM-write guard wraps the auto-installed updateWorkingMemory tool centrally.
export class GuardedMemory extends Memory {
  public listTools(config?: MemoryConfigInternal): ReturnType<Memory['listTools']> {
    const tools = super.listTools(config);
    if (tools.updateWorkingMemory) {
      tools.updateWorkingMemory = wrapUpdateWorkingMemoryTool(
        tools.updateWorkingMemory as never,
      ) as never;
    }
    return tools;
  }
}

// ---------------------------------------------------------------------------
// PgVector singleton — same lazy-init pattern as getIdentityVectorStore
// ---------------------------------------------------------------------------
let cachedRecallVector: { store: PgVector; databaseUrl: string } | null = null;

function getRecallVector(databaseUrl: string): PgVector {
  if (cachedRecallVector?.databaseUrl === databaseUrl) return cachedRecallVector.store;
  if (cachedRecallVector) {
    void cachedRecallVector.store.disconnect().catch(() => {});
  }
  const store = new PgVector({
    id: 'agent-recall',
    connectionString: databaseUrl,
    schemaName: 'agent',
  });
  cachedRecallVector = { store, databaseUrl };
  return store;
}

// ---------------------------------------------------------------------------
// Resource-scoped userContext memory factory
// ---------------------------------------------------------------------------
export function buildMemory(opts: {
  mastra: Mastra | undefined;
  databaseUrl?: string;
}): { memory: Memory; memoryConfig: MemoryConfig } | undefined {
  const storage = opts.mastra?.getStorage();
  if (!storage) return undefined;

  const baseOpts: Pick<MemoryConfig, 'lastMessages' | 'generateTitle' | 'workingMemory'> = {
    lastMessages: agentEnv.AGENT_MEMORY_LAST_MESSAGES,
    generateTitle: true,
    workingMemory: {
      enabled: true,
      scope: 'resource',
      schema: WorkingMemorySchema,
    },
  };

  if (!opts.databaseUrl) {
    const memoryConfig: MemoryConfig = { ...baseOpts, semanticRecall: false };
    const memory = new GuardedMemory({
      storage: storage as never,
      options: memoryConfig,
    });
    return { memory, memoryConfig };
  }

  const vector = getRecallVector(opts.databaseUrl);
  const embedder = new ModelRouterEmbeddingModel(
    process.env.EMBED_MODEL ?? 'openai/text-embedding-3-small',
  );
  const memoryConfig: MemoryConfig = {
    ...baseOpts,
    semanticRecall: {
      topK: 5,
      messageRange: 2,
      scope: 'thread',
      indexConfig: {
        type: 'hnsw',
        metric: 'dotproduct',
        hnsw: { m: 16, efConstruction: 64 },
      },
    },
  };
  const memory = new GuardedMemory({
    storage: storage as never,
    vector,
    embedder,
    options: memoryConfig,
  });
  return { memory, memoryConfig };
}

// ---------------------------------------------------------------------------
// Conversation-entities memory factory
//
// Thread-scoped working memory holding server-owned task-ref state. A plain
// Memory (not GuardedMemory) because it is never exposed to the model: no agent
// holds it, so no updateWorkingMemory tool is generated from it. The recorder
// and resolver call get/updateWorkingMemory on it directly, keyed on the real
// chat thread id. Shares the same storage as the userContext memory; thread
// scope writes to thread.metadata.workingMemory while resource scope writes to
// mastra_resources, so the two never collide.
// ---------------------------------------------------------------------------
export function buildEntitiesMemory(opts: {
  mastra: Mastra | undefined;
}): { memory: Memory; memoryConfig: MemoryConfig } | undefined {
  const storage = opts.mastra?.getStorage();
  if (!storage) return undefined;
  const memoryConfig: MemoryConfig = {
    lastMessages: false,
    semanticRecall: false,
    workingMemory: {
      enabled: true,
      scope: 'thread',
      schema: ConversationEntitiesSchema,
    },
  };
  const memory = new Memory({ storage: storage as never, options: memoryConfig });
  return { memory, memoryConfig };
}
