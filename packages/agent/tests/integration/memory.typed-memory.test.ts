import { Mastra } from '@mastra/core';
import { PostgresStore } from '@mastra/pg';
import {
  EMPTY_ENTITIES,
  EMPTY_WORKING_MEMORY,
  parseEntities,
  parseWorkingMemory,
  serializeEntities,
  serializeWorkingMemory,
  wrapUpdateWorkingMemoryTool,
} from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { buildEntitiesMemory, buildMemory } from '../../src/backend/memory.ts';
import { withAgentTestDb } from '../helpers.ts';

const UUID_A = '66be2be2-394d-4184-b106-c412289fd1e1';

describe('typed working memory: thread-scoped entities + resource-scoped userContext', () => {
  it('conversation entities are isolated per chat thread (no cross-conversation leak)', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const storage = new PostgresStore({ id: 't-iso', schemaName: 'agent', pool });
      await storage.init();
      const mastra = new Mastra({ storage, logger: false });
      const built = buildEntitiesMemory({ mastra });
      if (!built) throw new Error('entities memory required');
      const { memory: entitiesMemory, memoryConfig: entitiesMemoryConfig } = built;

      const resourceId = 'user-1';
      // Thread-scoped working memory lives in thread metadata → threads must exist.
      await entitiesMemory.createThread({ threadId: 'conv-A', resourceId });
      await entitiesMemory.createThread({ threadId: 'conv-B', resourceId });

      // Conversation A records a task (the entity recorder's storage path).
      await entitiesMemory.updateWorkingMemory({
        threadId: 'conv-A',
        workingMemory: serializeEntities({
          ...EMPTY_ENTITIES,
          recentTasks: [
            { taskId: UUID_A, title: 'Audit K8s security', lastSeenAt: new Date().toISOString() },
          ],
          lastDiscussedTaskId: UUID_A,
        }),
        memoryConfig: entitiesMemoryConfig,
      });

      // A *different* conversation for the SAME user must not see A's entities.
      const entitiesB = parseEntities(
        await entitiesMemory.getWorkingMemory({
          threadId: 'conv-B',
          memoryConfig: entitiesMemoryConfig,
        }),
      );
      expect(entitiesB.recentTasks).toEqual([]);
      expect(entitiesB.lastDiscussedTaskId).toBeNull();

      // Conversation A still retains its own entities across turns.
      const entitiesA = parseEntities(
        await entitiesMemory.getWorkingMemory({
          threadId: 'conv-A',
          memoryConfig: entitiesMemoryConfig,
        }),
      );
      expect(entitiesA.recentTasks[0]?.taskId).toBe(UUID_A);
      expect(entitiesA.lastDiscussedTaskId).toBe(UUID_A);
    });
  }, 60_000);

  it('userContext persists across the user’s conversations (resource scope)', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const storage = new PostgresStore({ id: 't-uc', schemaName: 'agent', pool });
      await storage.init();
      const mastra = new Mastra({ storage, logger: false });
      const built = buildMemory({ mastra });
      if (!built) throw new Error('memory required');
      const { memory, memoryConfig } = built;

      const resourceId = 'user-1';
      await memory.updateWorkingMemory({
        threadId: 'conv-A',
        resourceId,
        workingMemory: serializeWorkingMemory({
          userContext: { ...EMPTY_WORKING_MEMORY.userContext, timezone: 'Asia/Ho_Chi_Minh' },
        }),
        memoryConfig,
      });

      // Read from a different conversation: resource scope shares it (per-user).
      const other = parseWorkingMemory(
        await memory.getWorkingMemory({ threadId: 'conv-B', resourceId, memoryConfig }),
      );
      expect(other.userContext.timezone).toBe('Asia/Ho_Chi_Minh');
    });
  }, 60_000);

  it('LLM guard blocks entity-zone writes through the userContext updateWorkingMemory tool', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const storage = new PostgresStore({ id: 't-guard', schemaName: 'agent', pool });
      await storage.init();
      const mastra = new Mastra({ storage, logger: false });
      const built = buildMemory({ mastra });
      if (!built) throw new Error('memory required');
      const { memory, memoryConfig } = built;

      const resourceId = 'r-guard';
      const threadId = 't-guard';

      // Inner tool replicates Mastra's schema-mode merge into the resource WM.
      const innerTool = {
        id: 'updateWorkingMemory',
        execute: async (input: { memory: string }) => {
          const existing = parseWorkingMemory(
            await memory.getWorkingMemory({ threadId, resourceId, memoryConfig }),
          );
          const patch = JSON.parse(input.memory) as {
            userContext?: Record<string, unknown>;
          };
          const merged = { userContext: { ...existing.userContext, ...(patch.userContext ?? {}) } };
          await memory.updateWorkingMemory({
            threadId,
            resourceId,
            workingMemory: serializeWorkingMemory(merged as never),
            memoryConfig,
          });
          return { success: true };
        },
      };

      const guarded = wrapUpdateWorkingMemoryTool(innerTool as never);
      await guarded.execute(
        {
          memory: JSON.stringify({
            userContext: { notes: 'a soft note from the model' },
            entities: {
              recentTasks: [
                {
                  taskId: 'corrupt-uuid',
                  title: 'Corrupted',
                  lastSeenAt: new Date().toISOString(),
                },
              ],
            },
          }),
        } as never,
        {} as never,
      );

      const after = parseWorkingMemory(
        await memory.getWorkingMemory({ threadId, resourceId, memoryConfig }),
      );
      // Soft field landed; the entity zone never entered the resource WM.
      expect(after.userContext.notes).toBe('a soft note from the model');
      expect((after as Record<string, unknown>).entities).toBeUndefined();
    });
  }, 60_000);
});
