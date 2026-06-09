import { GetObjectCommand } from '@aws-sdk/client-s3';
import { countTokens } from '@seta/shared-embeddings';
import { getS3Client } from '@seta/shared-storage';
import { fileTypeFromBuffer } from 'file-type';
import {
  listPendingThreadAttachments,
  type PendingThreadAttachment,
} from '../domain/chat-attachment.ts';
import type { Parser } from '../parse/parsers/contract.ts';
import { csvParser } from '../parse/parsers/csv.ts';
import { docxParser } from '../parse/parsers/docx.ts';
import { pdfParser } from '../parse/parsers/pdf.ts';
import { textParser } from '../parse/parsers/text.ts';
import { xlsxParser } from '../parse/parsers/xlsx.ts';

export class ContextOverflowError extends Error {
  readonly requiredTokens: number;
  readonly budgetTokens: number;
  constructor(requiredTokens: number, budgetTokens: number) {
    super(`attached files need ~${requiredTokens} tokens but the budget is ${budgetTokens}`);
    this.name = 'ContextOverflowError';
    this.requiredTokens = requiredTokens;
    this.budgetTokens = budgetTokens;
  }
}

export interface ConsumedAttachment {
  file_id: string;
  filename: string;
  text: string;
}

export interface FailedAttachment {
  file_id: string;
  filename: string;
  reason: string;
}

const DEFAULT_PARSERS: Record<string, Parser> = {
  pdf: pdfParser,
  docx: docxParser,
  xlsx: xlsxParser,
  csv: csvParser,
  txt: textParser,
  md: textParser,
};

// docx/xlsx are zip containers; file-type reports 'application/zip'.
const ALLOWED_SNIFF_MIME = new Set([
  'application/pdf',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
]);

async function defaultFetchObject(s3_key: string): Promise<Buffer> {
  const bucket = process.env.S3_BUCKET ?? 'seta-knowledge';
  const res = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: s3_key }));
  const body = res.Body as AsyncIterable<Uint8Array> | undefined;
  if (!body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const c of body) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

/** Returns the sniffed MIME (or undefined for text/no-magic files). */
async function defaultSniff(buf: Buffer): Promise<string | undefined> {
  const t = await fileTypeFromBuffer(buf);
  return t?.mime;
}

export interface ConsumeDeps {
  listPending: (i: { tenant_id: string; thread_id: string }) => Promise<PendingThreadAttachment[]>;
  fetchObject: (s3_key: string) => Promise<Buffer>;
  sniff: (buf: Buffer) => Promise<string | undefined>;
  parsers: Record<string, Parser>;
  countTokens: (s: string) => number;
}

const defaultConsumeDeps: ConsumeDeps = {
  listPending: listPendingThreadAttachments,
  fetchObject: defaultFetchObject,
  sniff: defaultSniff,
  parsers: DEFAULT_PARSERS,
  countTokens,
};

function formatContextBlock(files: ConsumedAttachment[], failed: FailedAttachment[]): string {
  const blocks = files
    .map((f) => `<<<FILE: ${f.filename}>>>\n${f.text}\n<<<END ${f.filename}>>>`)
    .join('\n\n');
  const notice = failed.length
    ? `[Unreadable attachments skipped: ${failed
        .map((f) => `${f.filename} (${f.reason})`)
        .join('; ')}]`
    : '';
  const body = [blocks, notice].filter(Boolean).join('\n\n');
  return body ? `Context:\n${body}` : '';
}

export interface ConsumeInput {
  tenant_id: string;
  thread_id: string;
  query: string;
  contextWindowTokens: number;
  reservedOutputTokens: number;
  safetyRatio: number;
  instructionOverheadTokens?: number;
}

/** Read + parse a thread's pending attachments into a single `Context:` block,
 *  enforcing the context-window budget. Pure over `deps`; does NOT mutate. The
 *  caller injects the block this turn and marks files consumed after success. */
export async function consumeThreadAttachmentsAsText(
  input: ConsumeInput,
  deps: ConsumeDeps = defaultConsumeDeps,
): Promise<{
  contextBlock: string;
  files: ConsumedAttachment[];
  consumedFileIds: string[];
  failed: FailedAttachment[];
  failedFileIds: string[];
}> {
  const pending = await deps.listPending({
    tenant_id: input.tenant_id,
    thread_id: input.thread_id,
  });
  if (pending.length === 0)
    return { contextBlock: '', files: [], consumedFileIds: [], failed: [], failedFileIds: [] };

  const files: ConsumedAttachment[] = [];
  const failed: FailedAttachment[] = [];
  // Per-file isolation: a fetch/sniff/parse failure on one file (e.g. a broken
  // PDF, or its S3 object already TTL-deleted) skips just that file instead of
  // failing the whole turn. The caller marks failed files 'failed' so they drop
  // out of listPendingThreadAttachments and never re-poison later turns.
  for (const p of pending) {
    try {
      const buf = await deps.fetchObject(p.s3_key);
      const mime = await deps.sniff(buf);
      if (mime && !ALLOWED_SNIFF_MIME.has(mime)) {
        throw new Error(`disallowed content type: ${mime}`);
      }
      const ext = p.filename.split('.').pop()?.toLowerCase() ?? '';
      const parser = deps.parsers[ext];
      if (!parser) throw new Error(`no parser for .${ext}`);
      const parsed = await parser.parse(buf);
      const text = parsed.sections.map((s) => s.text).join('\n\n');
      files.push({ file_id: p.file_id, filename: p.filename, text });
    } catch (e) {
      failed.push({
        file_id: p.file_id,
        filename: p.filename,
        reason: (e instanceof Error ? e.message : 'could not read file').slice(0, 100),
      });
    }
  }

  const contextBlock = formatContextBlock(files, failed);
  const budget =
    Math.floor(input.contextWindowTokens * input.safetyRatio) -
    input.reservedOutputTokens -
    (input.instructionOverheadTokens ?? 0);
  const required = deps.countTokens(`${contextBlock}\n\n${input.query}`);
  if (required > budget) throw new ContextOverflowError(required, budget);

  return {
    contextBlock,
    files,
    consumedFileIds: files.map((f) => f.file_id),
    failed,
    failedFileIds: failed.map((f) => f.file_id),
  };
}
