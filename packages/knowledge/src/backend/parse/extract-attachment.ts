import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client } from '@seta/shared-storage';
import { fileTypeFromBuffer } from 'file-type';
import type { Parser } from './parsers/contract.ts';
import { csvParser } from './parsers/csv.ts';
import { docxParser } from './parsers/docx.ts';
import { pdfParser } from './parsers/pdf.ts';
import { textParser } from './parsers/text.ts';
import { xlsxParser } from './parsers/xlsx.ts';

// Single source of truth for "can we read this attachment" — shared by the
// turn-time consume path and the upload-time /processed validation so the two
// can never drift on allowed types or parser selection.

export const DEFAULT_PARSERS: Record<string, Parser> = {
  pdf: pdfParser,
  docx: docxParser,
  xlsx: xlsxParser,
  csv: csvParser,
  txt: textParser,
  md: textParser,
};

// docx/xlsx are zip containers; file-type reports 'application/zip'.
export const ALLOWED_SNIFF_MIME = new Set([
  'application/pdf',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
]);

/** Returns the sniffed MIME (or undefined for text/no-magic files). */
export async function defaultSniff(buf: Buffer): Promise<string | undefined> {
  const t = await fileTypeFromBuffer(buf);
  return t?.mime;
}

export async function fetchAttachmentObject(s3_key: string): Promise<Buffer> {
  const bucket = process.env.S3_BUCKET ?? 'seta-knowledge';
  const res = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: s3_key }));
  const body = res.Body as AsyncIterable<Uint8Array> | undefined;
  if (!body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const c of body) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

export interface ExtractDeps {
  sniff: (buf: Buffer) => Promise<string | undefined>;
  parsers: Record<string, Parser>;
}

export const defaultExtractDeps: ExtractDeps = {
  sniff: defaultSniff,
  parsers: DEFAULT_PARSERS,
};

/** Sniff + parse an attachment buffer to plain text. Throws on a disallowed
 *  content type, an unsupported extension, or a parse failure (corrupt file). */
export async function extractAttachmentText(
  buf: Buffer,
  filename: string,
  deps: ExtractDeps = defaultExtractDeps,
): Promise<string> {
  const mime = await deps.sniff(buf);
  if (mime && !ALLOWED_SNIFF_MIME.has(mime)) {
    throw new Error(`disallowed content type: ${mime}`);
  }
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const parser = deps.parsers[ext];
  if (!parser) throw new Error(`no parser for .${ext}`);
  const parsed = await parser.parse(buf);
  return parsed.sections.map((s) => s.text).join('\n\n');
}
