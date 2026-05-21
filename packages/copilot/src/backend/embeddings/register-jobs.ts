import { getPool } from '@seta/shared-db';
import type { TaskList } from 'graphile-worker';
import { type EmbedTaskPayload, embedTask } from './embed-task.ts';
import { embedUserProfileStub } from './embed-user-profile-stub.ts';
import { resolveEmbeddingProvider } from './provider-resolver.ts';

/**
 * Job map for the embeddings pipeline. Spread into the `jobs` option of
 * graphile-worker's startWorkerPool.
 *
 * M3.2: embed_task uses the real handler (build source → hash gate → chunk →
 *       ensureTenantPartition → embed → bulk upsert).
 * M3.3: embed_user_profile will replace the stub.
 */
export const embeddingJobs: TaskList = {
  embed_task: async (payload, _helpers) => {
    const provider = resolveEmbeddingProvider();
    const pool = getPool('worker');
    await embedTask(payload as EmbedTaskPayload, { pool, provider });
  },
  embed_user_profile: embedUserProfileStub as unknown as TaskList[string],
};
