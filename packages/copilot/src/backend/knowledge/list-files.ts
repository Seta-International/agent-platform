import { desc, eq } from 'drizzle-orm';
import { copilotDb } from '../../db/index.ts';
import { tenantKnowledgeFiles } from '../../db/schema.tenant-knowledge-files.ts';

export interface ListKnowledgeFilesInput {
  tenant_id: string;
  limit: number;
}

export interface KnowledgeFileSummary {
  file_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  status: 'uploading' | 'parsing' | 'embedding' | 'ready' | 'failed';
  error_reason: string | null;
  created_at: string;
  processed_at: string | null;
}

export async function listKnowledgeFiles(
  input: ListKnowledgeFilesInput,
): Promise<KnowledgeFileSummary[]> {
  const db = copilotDb();
  const rows = await db
    .select()
    .from(tenantKnowledgeFiles)
    .where(eq(tenantKnowledgeFiles.tenant_id, input.tenant_id))
    .orderBy(desc(tenantKnowledgeFiles.created_at))
    .limit(input.limit);
  return rows.map((r) => ({
    file_id: String(r.id),
    filename: r.filename,
    mime_type: r.mime_type,
    size_bytes: Number(r.size_bytes),
    status: r.status as KnowledgeFileSummary['status'],
    error_reason: r.error_reason,
    created_at: r.created_at.toISOString(),
    processed_at: r.processed_at?.toISOString() ?? null,
  }));
}
