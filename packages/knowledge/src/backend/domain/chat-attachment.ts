import { buildTenantKey, presignedUploadUrl } from '@seta/shared-storage';
import { and, desc, eq } from 'drizzle-orm';
import { knowledgeDb } from '../db/client.ts';
import { files } from '../db/schema.ts';
import { type PurgeKnowledgeFileDeps, purgeKnowledgeFile } from './delete-file.ts';
import { ALLOWED_EXTENSIONS, MAX_BYTES } from './upload-url.ts';

const UPLOAD_URL_TTL_SECONDS = 15 * 60;
const DEFAULT_MAX_PER_THREAD = 10;

export class ChatAttachmentError extends Error {
  readonly code: 'VALIDATION' | 'LIMIT' | 'NOT_FOUND';
  constructor(code: 'VALIDATION' | 'LIMIT' | 'NOT_FOUND', message: string) {
    super(message);
    this.name = 'ChatAttachmentError';
    this.code = code;
  }
}

export interface RequestChatAttachmentUploadInput {
  tenant_id: string;
  uploaded_by: string;
  thread_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
}
export interface RequestChatAttachmentUploadDeps {
  bucket: string;
  presign?: typeof presignedUploadUrl;
  maxPerThread?: number;
}
export interface RequestChatAttachmentUploadResult {
  file_id: string;
  upload_url: string;
  s3_key: string;
}

export async function requestChatAttachmentUpload(
  input: RequestChatAttachmentUploadInput,
  deps: RequestChatAttachmentUploadDeps,
): Promise<RequestChatAttachmentUploadResult> {
  const ext = input.filename.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new ChatAttachmentError(
      'VALIDATION',
      `file type not allowed: .${ext} (allowed: ${[...ALLOWED_EXTENSIONS].join(', ')})`,
    );
  }
  if (input.size_bytes > MAX_BYTES) {
    throw new ChatAttachmentError(
      'VALIDATION',
      `size ${input.size_bytes} exceeds limit ${MAX_BYTES}`,
    );
  }

  const db = knowledgeDb();
  const cap = deps.maxPerThread ?? DEFAULT_MAX_PER_THREAD;
  const existing = await db
    .select({ id: files.id, status: files.status })
    .from(files)
    .where(
      and(
        eq(files.tenant_id, input.tenant_id),
        eq(files.thread_id, input.thread_id),
        eq(files.origin, 'chat'),
      ),
    );
  const active = existing.filter((r) => r.status !== 'failed').length;
  if (active >= cap) {
    throw new ChatAttachmentError('LIMIT', `thread attachment cap ${cap} reached`);
  }

  const [row] = await db
    .insert(files)
    .values({
      tenant_id: input.tenant_id,
      uploaded_by: input.uploaded_by,
      filename: input.filename,
      mime_type: input.mime_type,
      size_bytes: BigInt(input.size_bytes),
      s3_key: `PENDING-${crypto.randomUUID()}`,
      status: 'uploading',
      thread_id: input.thread_id,
      origin: 'chat',
    })
    .returning({ id: files.id });
  if (!row) throw new ChatAttachmentError('VALIDATION', 'insert returned no row');

  const s3Key = buildTenantKey({
    tenant_id: input.tenant_id,
    domain: 'chat-attachments',
    file_id: String(row.id),
    filename: input.filename,
  });
  await db.update(files).set({ s3_key: s3Key }).where(eq(files.id, row.id));

  const presign = deps.presign ?? presignedUploadUrl;
  const upload_url = await presign({
    bucket: deps.bucket,
    key: s3Key,
    contentType: input.mime_type,
    expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
  });

  return { file_id: String(row.id), upload_url, s3_key: s3Key };
}

export interface MarkChatAttachmentProcessedInput {
  tenant_id: string;
  file_id: string;
  uploaded_by: string;
}
export interface MarkChatAttachmentProcessedDeps {
  enqueueScanJob: (payload: {
    tenant_id: string;
    file_id: string;
    s3_key: string;
  }) => Promise<void>;
}

export async function markChatAttachmentProcessed(
  input: MarkChatAttachmentProcessedInput,
  deps: MarkChatAttachmentProcessedDeps,
): Promise<void> {
  const db = knowledgeDb();
  const [row] = await db
    .select({ s3_key: files.s3_key, scan_status: files.scan_status })
    .from(files)
    .where(
      and(
        eq(files.tenant_id, input.tenant_id),
        eq(files.id, BigInt(input.file_id)),
        eq(files.uploaded_by, input.uploaded_by),
        eq(files.origin, 'chat'),
        eq(files.status, 'uploading'),
      ),
    )
    .limit(1);
  if (!row) return; // not owner / not chat / already past 'uploading' — idempotent
  if (row.scan_status !== 'pending') return; // scan already started — idempotent
  await deps.enqueueScanJob({
    tenant_id: input.tenant_id,
    file_id: input.file_id,
    s3_key: row.s3_key,
  });
}

export interface ChatAttachmentStatus {
  file_id: string;
  filename: string;
  status: 'uploading' | 'parsing' | 'embedding' | 'ready' | 'failed';
  scan_status: 'pending' | 'scanning' | 'clean' | 'infected' | 'error';
  error_reason: string | null;
}

export async function getChatAttachmentStatus(input: {
  tenant_id: string;
  file_id: string;
  uploaded_by: string;
}): Promise<ChatAttachmentStatus | null> {
  const db = knowledgeDb();
  const [row] = await db
    .select({
      id: files.id,
      filename: files.filename,
      status: files.status,
      scan_status: files.scan_status,
      error_reason: files.error_reason,
    })
    .from(files)
    .where(
      and(
        eq(files.tenant_id, input.tenant_id),
        eq(files.id, BigInt(input.file_id)),
        eq(files.uploaded_by, input.uploaded_by),
        eq(files.origin, 'chat'),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    file_id: String(row.id),
    filename: row.filename,
    status: row.status as ChatAttachmentStatus['status'],
    scan_status: row.scan_status as ChatAttachmentStatus['scan_status'],
    error_reason: row.error_reason,
  };
}

export interface ThreadAttachment {
  file_id: string;
  filename: string;
  status: 'uploading' | 'parsing' | 'embedding' | 'ready' | 'failed';
}

export async function listThreadAttachments(input: {
  tenant_id: string;
  thread_id: string;
}): Promise<ThreadAttachment[]> {
  const db = knowledgeDb();
  const rows = await db
    .select({ id: files.id, filename: files.filename, status: files.status })
    .from(files)
    .where(
      and(
        eq(files.tenant_id, input.tenant_id),
        eq(files.thread_id, input.thread_id),
        eq(files.origin, 'chat'),
      ),
    )
    .orderBy(desc(files.created_at));
  return rows.map((r) => ({
    file_id: String(r.id),
    filename: r.filename,
    status: r.status as ThreadAttachment['status'],
  }));
}

export interface DeleteChatAttachmentInput {
  tenant_id: string;
  file_id: string;
  uploaded_by: string;
}

export async function deleteChatAttachment(
  input: DeleteChatAttachmentInput,
  deps: PurgeKnowledgeFileDeps,
): Promise<void> {
  const db = knowledgeDb();
  const [row] = await db
    .select({ id: files.id })
    .from(files)
    .where(
      and(
        eq(files.tenant_id, input.tenant_id),
        eq(files.id, BigInt(input.file_id)),
        eq(files.uploaded_by, input.uploaded_by),
        eq(files.origin, 'chat'),
      ),
    )
    .limit(1);
  if (!row) return; // not owner / not chat — idempotent no-op
  await purgeKnowledgeFile({ tenant_id: input.tenant_id, file_id: input.file_id }, deps);
}
