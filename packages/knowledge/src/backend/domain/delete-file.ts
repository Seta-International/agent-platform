import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import type { PgVector } from '@mastra/pg';
import type { SessionScope } from '@seta/core';
import { getS3Client } from '@seta/shared-storage';
import { and, eq } from 'drizzle-orm';
import { knowledgeDb } from '../db/client.ts';
import { chunks, files } from '../db/schema.ts';
import {
  ensureKnowledgeVectorIndex,
  getKnowledgeVectorStore,
  KNOWLEDGE_VECTOR_INDEX,
  knowledgeVectorId,
} from '../embeddings/vector-store.ts';
import { requirePermission } from '../rbac.ts';

export interface DeleteKnowledgeFileInput {
  tenant_id: string;
  file_id: string;
}

export interface DeleteKnowledgeFileDeps {
  session: SessionScope;
  /** Override for tests. */
  deleteS3Object?: (s3_key: string) => Promise<void>;
  bucket?: string;
  pgVector?: PgVector;
  databaseUrl?: string;
  log?: {
    error: (obj: unknown, msg?: string) => void;
  };
}

export async function deleteKnowledgeFile(
  input: DeleteKnowledgeFileInput,
  deps: DeleteKnowledgeFileDeps,
): Promise<void> {
  requirePermission(deps.session, 'knowledge.file.delete');
  const db = knowledgeDb();

  const fileRow = await db
    .select({ s3_key: files.s3_key })
    .from(files)
    .where(and(eq(files.tenant_id, input.tenant_id), eq(files.id, BigInt(input.file_id))))
    .limit(1);
  if (fileRow.length === 0) return;

  const chunkRows = await db
    .select({ chunk_ordinal: chunks.chunk_ordinal })
    .from(chunks)
    .where(and(eq(chunks.tenant_id, input.tenant_id), eq(chunks.file_id, BigInt(input.file_id))));

  if (chunkRows.length > 0) {
    const pgVector =
      deps.pgVector ??
      (deps.databaseUrl
        ? getKnowledgeVectorStore(deps.databaseUrl)
        : getKnowledgeVectorStore(
            process.env.DATABASE_URL ??
              (() => {
                throw new Error('DATABASE_URL required for knowledge.delete-file');
              })(),
          ));
    await ensureKnowledgeVectorIndex(pgVector);
    for (const row of chunkRows) {
      await pgVector
        .deleteVector({
          indexName: KNOWLEDGE_VECTOR_INDEX,
          id: knowledgeVectorId(input.tenant_id, input.file_id, row.chunk_ordinal),
        })
        .catch(() => {});
    }
  }

  await db
    .delete(chunks)
    .where(and(eq(chunks.tenant_id, input.tenant_id), eq(chunks.file_id, BigInt(input.file_id))));
  await db
    .delete(files)
    .where(and(eq(files.tenant_id, input.tenant_id), eq(files.id, BigInt(input.file_id))));

  // biome-ignore lint/style/noNonNullAssertion: fileRow.length === 0 returned above
  const s3Key = fileRow[0]!.s3_key;
  if (deps.deleteS3Object) {
    await deps.deleteS3Object(s3Key);
    return;
  }
  const bucket = deps.bucket ?? process.env.S3_BUCKET ?? 'seta-knowledge';
  try {
    const client = getS3Client();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: s3Key }));
  } catch (err) {
    if (deps.log) {
      deps.log.error(
        { subsystem: 'knowledge.delete-file', s3Key, bucket, err },
        'failed to delete S3 object',
      );
    } else {
      console.error(`failed to delete S3 object ${s3Key}:`, err);
    }
  }
}
