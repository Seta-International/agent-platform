import type { TaskList } from 'graphile-worker';
import { type EmbedTaskPayload, embedTask } from './embed-task.ts';
import { resolveEmbeddingProvider } from './provider-resolver.ts';
import { getPlannerVectorStore } from './vector-store.ts';

export const plannerEmbeddingJobs: TaskList = {
  'planner.embed_task': async (payload, _helpers) => {
    const provider = resolveEmbeddingProvider();
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL required for planner embed worker');
    const pgVector = getPlannerVectorStore(databaseUrl);
    await embedTask(payload as EmbedTaskPayload, { provider, pgVector });
  },
};
