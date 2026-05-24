import type { SessionScope } from '@seta/core';
import { and, eq } from 'drizzle-orm';
import { knowledgeDb } from '../db/client.ts';
import { files } from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';

export interface MarkProcessedInput {
  tenant_id: string;
  file_id: string;
}

export interface MarkProcessedDeps {
  session: SessionScope;
  enqueueScanJob: (payload: {
    tenant_id: string;
    file_id: string;
    s3_key: string;
  }) => Promise<void>;
}

/**
 * Client signals upload-complete. The row stays in 'uploading' status until
 * the scan_upload job clears the file and flips it to 'parsing'. Idempotent:
 * re-deliveries of the same upload-complete signal find scan_status != 'pending'
 * and skip the enqueue.
 */
export async function markKnowledgeFileProcessed(
  input: MarkProcessedInput,
  deps: MarkProcessedDeps,
): Promise<void> {
  requirePermission(deps.session, 'knowledge.file.write');
  const db = knowledgeDb();
  const [row] = await db
    .select({ s3_key: files.s3_key, scan_status: files.scan_status })
    .from(files)
    .where(
      and(
        eq(files.tenant_id, input.tenant_id),
        eq(files.id, BigInt(input.file_id)),
        eq(files.status, 'uploading'),
      ),
    )
    .limit(1);

  if (!row) return; // already past 'uploading' or doesn't exist; idempotent
  if (row.scan_status !== 'pending') return; // scan already started; idempotent

  await deps.enqueueScanJob({
    tenant_id: input.tenant_id,
    file_id: input.file_id,
    s3_key: row.s3_key,
  });
}
