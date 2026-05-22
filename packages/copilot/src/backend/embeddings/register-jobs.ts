import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getPool } from '@seta/shared-db';
import { getS3Client } from '@seta/shared-storage';
import type { TaskList } from 'graphile-worker';
import {
  type EmbedKnowledgeChunksPayload,
  embedKnowledgeChunks,
} from '../knowledge/embed/embed-knowledge-chunks.ts';
import {
  type ParseKnowledgeFilePayload,
  parseKnowledgeFile,
} from '../knowledge/parse/parse-knowledge-file.ts';
import { type EmbedTaskPayload, embedTask } from './embed-task.ts';
import { type EmbedUserProfilePayload, embedUserProfile } from './embed-user-profile.ts';
import { resolveEmbeddingProvider } from './provider-resolver.ts';

const BUCKET = process.env.S3_BUCKET ?? 'seta-knowledge';

async function fetchS3Object(s3_key: string): Promise<Buffer> {
  const client = getS3Client();
  const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: s3_key }));
  if (!res.Body) throw new Error(`S3 object ${s3_key} returned no body`);
  const chunks: Buffer[] = [];
  for await (const c of res.Body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

export const embeddingJobs: TaskList = {
  embed_task: async (payload, _helpers) => {
    const provider = resolveEmbeddingProvider();
    const pool = getPool('worker');
    await embedTask(payload as EmbedTaskPayload, { pool, provider });
  },
  embed_user_profile: async (payload, _helpers) => {
    const provider = resolveEmbeddingProvider();
    const pool = getPool('worker');
    await embedUserProfile(payload as EmbedUserProfilePayload, { pool, provider });
  },
  parse_knowledge_file: async (payload, helpers) => {
    const sharedPool = getPool('worker');
    await parseKnowledgeFile(payload as ParseKnowledgeFilePayload, {
      pool: sharedPool,
      fetchObject: fetchS3Object,
      enqueueEmbedJob: async ({ tenant_id, file_id }) => {
        await helpers.addJob('embed_knowledge_chunks', {
          tenant_id,
          file_id,
          event_id: (payload as ParseKnowledgeFilePayload).event_id,
        });
      },
    });
  },
  embed_knowledge_chunks: async (payload, _helpers) => {
    const provider = resolveEmbeddingProvider();
    const sharedPool = getPool('worker');
    await embedKnowledgeChunks(payload as EmbedKnowledgeChunksPayload, {
      pool: sharedPool,
      provider,
    });
  },
};
