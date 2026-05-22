import { buildTenantKey, presignedUploadUrl } from '@seta/shared-storage';
import { eq } from 'drizzle-orm';
import { copilotDb } from '../../db/index.ts';
import { tenantKnowledgeFiles } from '../../db/schema.tenant-knowledge-files.ts';

const ALLOWED_EXTENSIONS = new Set(['pdf', 'docx', 'xlsx', 'csv', 'txt', 'md']);
const MAX_BYTES = 50 * 1024 * 1024;
const UPLOAD_URL_TTL_SECONDS = 15 * 60;

export interface RequestKnowledgeUploadInput {
  tenant_id: string;
  uploaded_by: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
}

export interface RequestKnowledgeUploadDeps {
  bucket: string;
  /** Override for tests. */
  presign?: typeof presignedUploadUrl;
}

export interface RequestKnowledgeUploadResult {
  file_id: string;
  upload_url: string;
  s3_key: string;
}

export async function requestKnowledgeUpload(
  input: RequestKnowledgeUploadInput,
  deps: RequestKnowledgeUploadDeps,
): Promise<RequestKnowledgeUploadResult> {
  const ext = input.filename.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(
      `file type not allowed: .${ext} (allowed: ${[...ALLOWED_EXTENSIONS].join(', ')})`,
    );
  }
  if (input.size_bytes > MAX_BYTES) {
    throw new Error(`size ${input.size_bytes} exceeds limit ${MAX_BYTES}`);
  }

  const db = copilotDb();

  // Insert with a placeholder s3_key — we need the row id to build the real key.
  const [row] = await db
    .insert(tenantKnowledgeFiles)
    .values({
      tenant_id: input.tenant_id,
      uploaded_by: input.uploaded_by,
      filename: input.filename,
      mime_type: input.mime_type,
      size_bytes: BigInt(input.size_bytes),
      s3_key: `PENDING-${crypto.randomUUID()}`,
      status: 'uploading',
    })
    .returning({ id: tenantKnowledgeFiles.id });

  if (!row) throw new Error('insert returned no row');

  const s3Key = buildTenantKey({
    tenant_id: input.tenant_id,
    domain: 'knowledge',
    file_id: String(row.id),
    filename: input.filename,
  });

  await db
    .update(tenantKnowledgeFiles)
    .set({ s3_key: s3Key })
    .where(eq(tenantKnowledgeFiles.id, row.id));

  const presign = deps.presign ?? presignedUploadUrl;
  const upload_url = await presign({
    bucket: deps.bucket,
    key: s3Key,
    contentType: input.mime_type,
    expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
  });

  return { file_id: String(row.id), upload_url, s3_key: s3Key };
}
