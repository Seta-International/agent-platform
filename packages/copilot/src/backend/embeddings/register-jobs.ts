import { getPool } from '@seta/shared-db';
import type { TaskList } from 'graphile-worker';
import { type EmbedUserProfilePayload, embedUserProfile } from './embed-user-profile.ts';
import { resolveEmbeddingProvider } from './provider-resolver.ts';

export const embeddingJobs: TaskList = {
  embed_user_profile: async (payload, _helpers) => {
    const provider = resolveEmbeddingProvider();
    const pool = getPool('worker');
    await embedUserProfile(payload as EmbedUserProfilePayload, { pool, provider });
  },
};
