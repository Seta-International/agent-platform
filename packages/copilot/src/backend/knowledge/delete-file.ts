import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client } from '@seta/shared-storage';
import { and, eq } from 'drizzle-orm';
import { copilotDb } from '../../db/index.ts';
import { tenantKnowledgeChunks } from '../../db/schema.tenant-knowledge-chunks.ts';
import { tenantKnowledgeEmbeddings } from '../../db/schema.tenant-knowledge-embeddings.ts';
import { tenantKnowledgeFiles } from '../../db/schema.tenant-knowledge-files.ts';

export interface DeleteKnowledgeFileInput {
  tenant_id: string;
  file_id: string;
}

export interface DeleteKnowledgeFileDeps {
  /** Override for tests. */
  deleteS3Object?: (s3_key: string) => Promise<void>;
  bucket?: string;
}

export async function deleteKnowledgeFile(
  input: DeleteKnowledgeFileInput,
  deps: DeleteKnowledgeFileDeps = {},
): Promise<void> {
  const db = copilotDb();

  const fileRow = await db
    .select({ s3_key: tenantKnowledgeFiles.s3_key })
    .from(tenantKnowledgeFiles)
    .where(
      and(
        eq(tenantKnowledgeFiles.tenant_id, input.tenant_id),
        eq(tenantKnowledgeFiles.id, BigInt(input.file_id)),
      ),
    )
    .limit(1);
  if (fileRow.length === 0) return;

  await db
    .delete(tenantKnowledgeEmbeddings)
    .where(
      and(
        eq(tenantKnowledgeEmbeddings.tenant_id, input.tenant_id),
        eq(tenantKnowledgeEmbeddings.file_id, BigInt(input.file_id)),
      ),
    );
  await db
    .delete(tenantKnowledgeChunks)
    .where(
      and(
        eq(tenantKnowledgeChunks.tenant_id, input.tenant_id),
        eq(tenantKnowledgeChunks.file_id, BigInt(input.file_id)),
      ),
    );
  await db
    .delete(tenantKnowledgeFiles)
    .where(
      and(
        eq(tenantKnowledgeFiles.tenant_id, input.tenant_id),
        eq(tenantKnowledgeFiles.id, BigInt(input.file_id)),
      ),
    );

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
