import { and, eq } from 'drizzle-orm';
import { copilotDb } from '../../db/index.ts';
import { tenantKnowledgeFiles } from '../../db/schema.tenant-knowledge-files.ts';

export interface DeleteKnowledgeFileInput {
  tenant_id: string;
  file_id: string;
}

/**
 * Delete the metadata row. S3 object cleanup is omitted here — chunk and
 * embedding rows that reference this file must also be cleaned in one pass
 * to avoid orphans, so the unified cleanup lives downstream once those tables
 * exist.
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
