import type { TaskList } from 'graphile-worker';
import { embedTaskStub } from './embed-task-stub.ts';
import { embedUserProfileStub } from './embed-user-profile-stub.ts';

/**
 * Job map for the embeddings pipeline. Spread into the `jobs` option of
 * graphile-worker's startWorkerPool.
 *
 * In M3.1 these are no-op stubs; M3.2 replaces embed_task with the real handler,
 * M3.3 replaces embed_user_profile.
 */
export const embeddingJobs: TaskList = {
  // payloads are statically known here; TaskList[string] is intentionally lossy
  embed_task: embedTaskStub as unknown as TaskList[string],
  embed_user_profile: embedUserProfileStub as unknown as TaskList[string],
};
