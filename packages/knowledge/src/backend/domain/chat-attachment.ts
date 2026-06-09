import { buildTenantKey, presignedUploadUrl } from '@seta/shared-storage';
import { and, eq, inArray } from 'drizzle-orm';
import { knowledgeDb } from '../db/client.ts';
import { files } from '../db/schema.ts';
import { extractAttachmentText, fetchAttachmentObject } from '../parse/extract-attachment.ts';
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
  warning?: string;
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

  const warnBytes = Number(process.env.CHAT_ATTACHMENT_THREAD_SIZE_WARN_BYTES ?? 26_214_400);
  const pendingBytes = await threadPendingBytes({
    tenant_id: input.tenant_id,
    thread_id: input.thread_id,
  });
  const warning =
    pendingBytes > warnBytes
      ? `This thread's attachments exceed ${Math.round(warnBytes / 1_048_576)} MB; large files may not fit the model context.`
      : undefined;
  return { file_id: String(row.id), upload_url, s3_key: s3Key, warning };
}

/** Upload-complete signal: flip 'uploading' → 'uploaded'. Returns the row's
 *  s3_key (so the caller can schedule the TTL delete) or null if not found. */
export async function markChatAttachmentUploaded(input: {
  tenant_id: string;
  file_id: string;
  uploaded_by: string;
}): Promise<{ s3_key: string } | null> {
  const db = knowledgeDb();
  const [row] = await db
    .update(files)
    .set({ status: 'uploaded' })
    .where(
      and(
        eq(files.tenant_id, input.tenant_id),
        eq(files.id, BigInt(input.file_id)),
        eq(files.uploaded_by, input.uploaded_by),
        eq(files.origin, 'chat'),
        eq(files.status, 'uploading'),
      ),
    )
    .returning({ s3_key: files.s3_key });
  return row ?? null;
}

/** Mark files consumed (their text is now in thread history). Idempotent: only
 *  flips rows currently 'uploaded'. */
export async function markAttachmentsConsumed(fileIds: string[]): Promise<void> {
  if (fileIds.length === 0) return;
  const db = knowledgeDb();
  await db
    .update(files)
    .set({ status: 'consumed', consumed_at: new Date() })
    .where(
      and(
        inArray(
          files.id,
          fileIds.map((id) => BigInt(id)),
        ),
        eq(files.status, 'uploaded'),
      ),
    );
}

export interface AssertReadableDeps {
  fetchObject?: (s3_key: string) => Promise<Buffer>;
  extract?: (buf: Buffer, filename: string) => Promise<string>;
}

/** Upload-time content gate: fetch the just-uploaded object and parse-probe it.
 *  On a corrupt/unreadable file, mark it 'failed' and throw a VALIDATION error
 *  so /processed returns 4xx and the upload never reaches 'uploaded'. No-op if
 *  the row is not a still-'uploading' chat file owned by the caller. */
export async function assertChatAttachmentReadable(
  input: { tenant_id: string; file_id: string; uploaded_by: string },
  deps: AssertReadableDeps = {},
): Promise<void> {
  const db = knowledgeDb();
  const [row] = await db
    .select({ s3_key: files.s3_key, filename: files.filename })
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
  if (!row) return; // not found / already finalized — idempotent
  const fetchObject = deps.fetchObject ?? fetchAttachmentObject;
  const extract = deps.extract ?? extractAttachmentText;
  try {
    await extract(await fetchObject(row.s3_key), row.filename);
  } catch (e) {
    const reason = (e instanceof Error ? e.message : 'could not read file').slice(0, 100);
    await markAttachmentsFailed([input.file_id], reason);
    throw new ChatAttachmentError('VALIDATION', `could not read "${row.filename}": ${reason}`);
  }
}

/** Mark files failed (could not be fetched/parsed). Idempotent: only flips rows
 *  still in flight ('uploading' at upload-time validation, or 'uploaded' at
 *  consume time). Once 'failed' they drop out of listPendingThreadAttachments,
 *  so later turns never re-parse them. */
export async function markAttachmentsFailed(fileIds: string[], reason?: string): Promise<void> {
  if (fileIds.length === 0) return;
  const db = knowledgeDb();
  await db
    .update(files)
    .set({ status: 'failed', error_reason: reason ?? 'attachment could not be read' })
    .where(
      and(
        inArray(
          files.id,
          fileIds.map((id) => BigInt(id)),
        ),
        inArray(files.status, ['uploading', 'uploaded']),
      ),
    );
}

export interface PendingThreadAttachment {
  file_id: string;
  filename: string;
  mime_type: string;
  s3_key: string;
}

/** The thread's not-yet-consumed ('uploaded') chat files, oldest first. */
export async function listPendingThreadAttachments(input: {
  tenant_id: string;
  thread_id: string;
}): Promise<PendingThreadAttachment[]> {
  const db = knowledgeDb();
  const rows = await db
    .select({
      id: files.id,
      filename: files.filename,
      mime_type: files.mime_type,
      s3_key: files.s3_key,
    })
    .from(files)
    .where(
      and(
        eq(files.tenant_id, input.tenant_id),
        eq(files.thread_id, input.thread_id),
        eq(files.origin, 'chat'),
        eq(files.status, 'uploaded'),
      ),
    )
    .orderBy(files.created_at);
  return rows.map((r) => ({
    file_id: String(r.id),
    filename: r.filename,
    mime_type: r.mime_type,
    s3_key: r.s3_key,
  }));
}

/** Total bytes of the thread's still-active ('uploading' or 'uploaded') chat files. */
export async function threadPendingBytes(input: {
  tenant_id: string;
  thread_id: string;
}): Promise<number> {
  const db = knowledgeDb();
  const rows = await db
    .select({ size: files.size_bytes })
    .from(files)
    .where(
      and(
        eq(files.tenant_id, input.tenant_id),
        eq(files.thread_id, input.thread_id),
        eq(files.origin, 'chat'),
        inArray(files.status, ['uploading', 'uploaded']),
      ),
    );
  return rows.reduce((sum, r) => sum + Number(r.size), 0);
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
