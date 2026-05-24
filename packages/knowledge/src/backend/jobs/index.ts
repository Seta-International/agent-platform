import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getPool } from '@seta/shared-db';
import { getS3Client } from '@seta/shared-storage';
import type { TaskList } from 'graphile-worker';
import {
  type EmbedKnowledgeChunksPayload,
  embedKnowledgeChunks,
} from '../embed/embed-knowledge-chunks.ts';
import { resolveEmbeddingProvider } from '../embed/provider-resolver.ts';
import {
  type ParseKnowledgeFilePayload,
  parseKnowledgeFile,
} from '../parse/parse-knowledge-file.ts';
import { runScanUpload, type ScanUploadPayload } from './scan-upload.ts';

const BUCKET = process.env.S3_BUCKET ?? 'seta-knowledge';
const CLAMAV_HOST = process.env.CLAMAV_HOST ?? 'clamav';
const CLAMAV_PORT = Number(process.env.CLAMAV_PORT ?? 3310);

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
      clamavHost: CLAMAV_HOST,
      clamavPort: CLAMAV_PORT,
      enqueueParseJob: async (parsePayload) => {
        await helpers.addJob('parse_knowledge_file', parsePayload);
      },
    });
  },
  parse_knowledge_file: async (payload, helpers) => {
    const pool = getPool('worker');
    await parseKnowledgeFile(payload as ParseKnowledgeFilePayload, {
      pool,
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
    const pool = getPool('worker');
    await embedKnowledgeChunks(payload as EmbedKnowledgeChunksPayload, { pool, provider });
  },
};
