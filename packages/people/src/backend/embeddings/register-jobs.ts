import { resolveEmbeddingProvider } from '@seta/shared-embeddings';
import type { TaskList } from 'graphile-worker';
import { type EmbedPersonProfilePayload, embedPersonProfile } from './embed-profile.ts';
import { getPeopleVectorStore } from './vector-store.ts';

export const peopleEmbeddingJobs: TaskList = {
  embed_person_profile: async (payload, _helpers) => {
    const provider = resolveEmbeddingProvider();
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL required for people embed worker');
    const pgVector = getPeopleVectorStore(databaseUrl);
    await embedPersonProfile(payload as EmbedPersonProfilePayload, { provider, pgVector });
  },
};
