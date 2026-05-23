import { and, eq } from 'drizzle-orm';
import { knowledgeDb } from '../db/client.ts';
import { files } from '../db/schema.ts';

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
  const db = knowledgeDb();
  const result = await db
    .update(files)
    .set({ status: 'parsing' })
    .where(
      and(
        eq(files.tenant_id, input.tenant_id),
        eq(files.id, BigInt(input.file_id)),
        eq(files.status, 'uploading'),
      ),
    )
    .returning({ id: files.id });

  if (result.length > 0) {
    await deps.enqueueParseJob({ tenant_id: input.tenant_id, file_id: input.file_id });
  }
}
