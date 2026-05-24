import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import type { SessionScope } from '@seta/core';
import { getS3Client } from '@seta/shared-storage';
import { and, eq } from 'drizzle-orm';
import { knowledgeDb } from '../db/client.ts';
import { chunks, embeddings, files } from '../db/schema.ts';
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

  await db
    .delete(embeddings)
    .where(
      and(eq(embeddings.tenant_id, input.tenant_id), eq(embeddings.file_id, BigInt(input.file_id))),
    );
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
    // DB rows are gone — S3 orphan can be reaped by lifecycle policy. Log but don't throw.
    console.error(`failed to delete S3 object ${s3Key}:`, err);
  }
}
