import { and, eq } from 'drizzle-orm';
import { copilotDb } from '../../db/index.ts';
import { tenantKnowledgeFiles } from '../../db/schema.tenant-knowledge-files.ts';

export interface DeleteKnowledgeFileInput {
  tenant_id: string;
  file_id: string;
}

/**
 * Delete the metadata row. S3 object cleanup deferred to M3.5 (which knows
 * about the chunk + embedding rows that may also need cleanup — one consistent
 * cleanup path is better than two partial ones).
 */
export async function deleteKnowledgeFile(input: DeleteKnowledgeFileInput): Promise<void> {
  const db = copilotDb();
  await db
    .delete(tenantKnowledgeFiles)
    .where(
      and(
        eq(tenantKnowledgeFiles.tenant_id, input.tenant_id),
        eq(tenantKnowledgeFiles.id, BigInt(input.file_id)),
      ),
    );
}
