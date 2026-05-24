// rbac: system-only — runs in the graphile-worker after the upload-complete
// transition. No caller session; the scan is gated by file_id ownership in
// the row itself.
import type { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { emit, withEmit } from '@seta/core/events';
import { eq } from 'drizzle-orm';
import { fileTypeFromBuffer } from 'file-type';
import {
  KNOWLEDGE_DOCUMENT_SCAN_COMPLETED,
  KNOWLEDGE_DOCUMENT_SCAN_COMPLETED_VERSION,
} from '../../events.ts';
import { knowledgeDb } from '../db/client.ts';
import { files } from '../db/schema.ts';
import { scanStream } from '../scan/clamav-client.ts';

const SNIFF_BYTES = 4096;

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip', // docx/xlsx are zip containers; file-type identifies them as zip when generic
  'text/csv',
  'text/plain',
]);

export interface ScanUploadPayload {
  tenant_id: string;
  file_id: string;
  s3_key: string;
}

export interface ScanUploadDeps {
  bucket: string;
  clamavHost: string;
  clamavPort: number;
  s3?: S3Client;
  enqueueParseJob?: (payload: {
    tenant_id: string;
    file_id: string;
    event_id: string;
  }) => Promise<void>;
}

export async function runScanUpload(input: ScanUploadPayload, deps: ScanUploadDeps): Promise<void> {
  const db = knowledgeDb();
  const s3 = deps.s3 ?? new S3Client({});
  const fileIdBig = BigInt(input.file_id);

  await db.update(files).set({ scan_status: 'scanning' }).where(eq(files.id, fileIdBig));

  try {
    // 1. Content-type sniff on the first 4 KB. Catches `.exe` masquerading as `.pdf`.
    const head = await s3.send(
      new GetObjectCommand({
        Bucket: deps.bucket,
        Key: input.s3_key,
        Range: `bytes=0-${SNIFF_BYTES - 1}`,
      }),
    );
    const headBuf = await streamToBuffer(head.Body as Readable | undefined);
    const sniff = await fileTypeFromBuffer(headBuf);
    if (sniff && !ALLOWED_MIME.has(sniff.mime)) {
      await markInfected(input, fileIdBig, `content_type_spoof: detected ${sniff.mime}`);
      await deleteObject(s3, deps.bucket, input.s3_key);
      return;
    }

    // 2. AV scan the full object. clamd's INSTREAM gets framed length-prefixed chunks.
    const full = await s3.send(new GetObjectCommand({ Bucket: deps.bucket, Key: input.s3_key }));
    const result = await scanStream(toBufferIterable(full.Body as Readable | undefined), {
      host: deps.clamavHost,
      port: deps.clamavPort,
    });

    if (result.status === 'infected') {
      await markInfected(input, fileIdBig, `av_hit: ${result.virus}`);
      await deleteObject(s3, deps.bucket, input.s3_key);
      return;
    }

    await db
      .update(files)
      .set({ scan_status: 'clean', scan_at: new Date(), status: 'parsing' })
      .where(eq(files.id, fileIdBig));
    await emitScanCompleted(input, 'clean');
    if (deps.enqueueParseJob) {
      await deps.enqueueParseJob({
        tenant_id: input.tenant_id,
        file_id: input.file_id,
        event_id: crypto.randomUUID(),
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(files)
      .set({ scan_status: 'error', scan_detail: message, scan_at: new Date() })
      .where(eq(files.id, fileIdBig));
    await emitScanCompleted(input, 'error', message);
    throw err;
  }
}

async function markInfected(
  input: ScanUploadPayload,
  fileIdBig: bigint,
  detail: string,
): Promise<void> {
  const db = knowledgeDb();
  await db
    .update(files)
    .set({
      scan_status: 'infected',
      scan_detail: detail,
      scan_at: new Date(),
      status: 'failed',
      error_reason: detail,
    })
    .where(eq(files.id, fileIdBig));
  await emitScanCompleted(input, 'infected', detail);
}

async function emitScanCompleted(
  input: ScanUploadPayload,
  result: 'clean' | 'infected' | 'error',
  detail?: string,
): Promise<void> {
  await withEmit({ actor: { userId: 'system', tenantId: input.tenant_id } }, async () => {
    await emit({
      tenantId: input.tenant_id,
      aggregateType: 'knowledge.file',
      aggregateId: input.file_id,
      eventType: KNOWLEDGE_DOCUMENT_SCAN_COMPLETED,
      eventVersion: KNOWLEDGE_DOCUMENT_SCAN_COMPLETED_VERSION,
      payload: detail
        ? { tenant_id: input.tenant_id, file_id: input.file_id, result, detail }
        : { tenant_id: input.tenant_id, file_id: input.file_id, result },
    });
  });
}

async function deleteObject(s3: S3Client, bucket: string, key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

async function streamToBuffer(body: Readable | undefined): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const c of body) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

async function* toBufferIterable(body: Readable | undefined): AsyncIterable<Buffer> {
  if (!body) return;
  for await (const c of body) yield Buffer.isBuffer(c) ? c : Buffer.from(c);
}
