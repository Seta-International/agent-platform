import type { TaskList } from 'graphile-worker';
import { type EmbedUserProfilePayload, embedUserProfile } from './embed-user-profile.ts';
import { resolveEmbeddingProvider } from './provider-resolver.ts';
import { getIdentityVectorStore } from './vector-store.ts';

export const embeddingJobs: TaskList = {
  embed_user_profile: async (payload, _helpers) => {
    const provider = resolveEmbeddingProvider();
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL required for identity embed worker');
    const pgVector = getIdentityVectorStore(databaseUrl);
    await embedUserProfile(payload as EmbedUserProfilePayload, { provider, pgVector });
  },
};
