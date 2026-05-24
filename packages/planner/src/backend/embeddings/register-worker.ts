import { getPool } from '@seta/shared-db';
import type { TaskList } from 'graphile-worker';
import { type EmbedTaskPayload, embedTask } from './embed-task.ts';
import { resolveEmbeddingProvider } from './provider-resolver.ts';

export const plannerEmbeddingJobs: TaskList = {
  'planner.embed_task': async (payload, _helpers) => {
    const provider = resolveEmbeddingProvider();
    const pool = getPool('worker');
    await embedTask(payload as EmbedTaskPayload, { pool, provider });
  },
};
