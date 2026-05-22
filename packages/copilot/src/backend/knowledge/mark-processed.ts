import { and, eq } from 'drizzle-orm';
import { copilotDb } from '../../db/index.ts';
import { tenantKnowledgeFiles } from '../../db/schema.tenant-knowledge-files.ts';

export interface MarkProcessedInput {
  tenant_id: string;
  file_id: string;
}

export async function markKnowledgeFileProcessed(input: MarkProcessedInput): Promise<void> {
  const db = copilotDb();
  await db
    .update(tenantKnowledgeFiles)
    .set({ status: 'parsing' })
    .where(
      and(
        eq(tenantKnowledgeFiles.tenant_id, input.tenant_id),
        eq(tenantKnowledgeFiles.id, BigInt(input.file_id)),
        eq(tenantKnowledgeFiles.status, 'uploading'),
      ),
    );
}
