import { and, eq } from 'drizzle-orm';
import { copilotDb } from '../../db/index.ts';
import { tenantKnowledgeFiles } from '../../db/schema.tenant-knowledge-files.ts';

export interface MarkProcessedInput {
  tenant_id: string;
  file_id: string;
}

export interface MarkProcessedDeps {
  enqueueParseJob: (payload: { tenant_id: string; file_id: string }) => Promise<void>;
}

export async function markKnowledgeFileProcessed(
  input: MarkProcessedInput,
  deps: MarkProcessedDeps,
): Promise<void> {
  const db = copilotDb();
  const result = await db
    .update(tenantKnowledgeFiles)
    .set({ status: 'parsing' })
    .where(
      and(
        eq(tenantKnowledgeFiles.tenant_id, input.tenant_id),
        eq(tenantKnowledgeFiles.id, BigInt(input.file_id)),
        eq(tenantKnowledgeFiles.status, 'uploading'),
      ),
    )
    .returning({ id: tenantKnowledgeFiles.id });

  if (result.length > 0) {
    await deps.enqueueParseJob({ tenant_id: input.tenant_id, file_id: input.file_id });
  }
}
