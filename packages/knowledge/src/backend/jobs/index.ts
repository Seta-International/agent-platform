import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getPool } from '@seta/shared-db';
import { resolveEmbeddingProvider } from '@seta/shared-embeddings';
import { getS3Client } from '@seta/shared-storage';
import type { JobHelpers, TaskList } from 'graphile-worker';
import {
  type EmbedKnowledgeChunksPayload,
  embedKnowledgeChunks,
} from '../embeddings/embed-knowledge-chunks.ts';
import { getKnowledgeVectorStore } from '../embeddings/vector-store.ts';
import {
  type ParseKnowledgeFilePayload,
  parseKnowledgeFile,
} from '../parse/parse-knowledge-file.ts';
import {
  type ChatAttachmentDeletePayload,
  runChatAttachmentDelete,
} from './chat-attachment-delete.ts';
import { runScanUpload, type ScanUploadPayload } from './scan-upload.ts';

const BUCKET = process.env.S3_BUCKET ?? 'seta-knowledge';

export const KNOWLEDGE_HEAVY_QUEUE = 'knowledge-heavy';

/**
 * Route large, memory-heavy jobs onto a single serial queue so they never run
 * concurrently: graphile-worker executes one job per named queue at a time.
 * This caps the knowledge parse/embed path to a single bounded-memory job at
 * once instead of up to `concurrency` (5) stacking spikes on the box (FUT-561).
 */
export function enqueueHeavy(
  helpers: JobHelpers,
  task: 'parse_knowledge_file' | 'embed_knowledge_chunks',
  payload: unknown,
): Promise<unknown> {
  return helpers.addJob(task, payload, { queueName: KNOWLEDGE_HEAVY_QUEUE });
}

async function fetchS3Object(s3_key: string): Promise<Buffer> {
  const client = getS3Client();
  const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: s3_key }));
  if (!res.Body) throw new Error(`S3 object ${s3_key} returned no body`);
  const chunks: Buffer[] = [];
  for await (const c of res.Body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

export const knowledgeJobs: TaskList = {
  scan_upload: async (payload, helpers) => {
    await runScanUpload(payload as ScanUploadPayload, {
      bucket: BUCKET,
      s3: getS3Client(),
      enqueueParseJob: async (parsePayload) => {
        await enqueueHeavy(helpers, 'parse_knowledge_file', parsePayload);
      },
    });
  },
  parse_knowledge_file: async (payload, helpers) => {
    const pool = getPool('worker');
    await parseKnowledgeFile(payload as ParseKnowledgeFilePayload, {
      pool,
      fetchObject: fetchS3Object,
      enqueueEmbedJob: async ({ tenant_id, file_id }) => {
        await enqueueHeavy(helpers, 'embed_knowledge_chunks', {
          tenant_id,
          file_id,
          event_id: (payload as ParseKnowledgeFilePayload).event_id,
        });
      },
    });
  },
  chat_attachment_delete: async (payload, _helpers) => {
    await runChatAttachmentDelete(payload as ChatAttachmentDeletePayload, { bucket: BUCKET });
  },
  embed_knowledge_chunks: async (payload, _helpers) => {
    const provider = resolveEmbeddingProvider();
    const pool = getPool('worker');
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL required for knowledge embed worker');
    const pgVector = getKnowledgeVectorStore(databaseUrl);
    await embedKnowledgeChunks(payload as EmbedKnowledgeChunksPayload, {
      pool,
      pgVector,
      provider,
    });
  },
};
