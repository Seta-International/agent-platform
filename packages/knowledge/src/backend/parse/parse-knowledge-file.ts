import { createHash } from 'node:crypto';
import { MDocument } from '@mastra/rag';
import type { Pool } from 'pg';
import type { ParsedDocument, Parser } from './parsers/contract.ts';
import { csvParser } from './parsers/csv.ts';
import { docxParser } from './parsers/docx.ts';
import { pdfParser } from './parsers/pdf.ts';
import { textParser } from './parsers/text.ts';
import { xlsxParser } from './parsers/xlsx.ts';

export interface ParseKnowledgeFilePayload {
  tenant_id: string;
  file_id: string;
  event_id: string;
}

export interface ParseKnowledgeFileDeps {
  pool: Pool;
  fetchObject: (s3_key: string) => Promise<Buffer>;
  enqueueEmbedJob: (payload: { tenant_id: string; file_id: string }) => Promise<void>;
}

const PARSERS: Record<string, Parser> = {
  pdf: pdfParser,
  docx: docxParser,
  xlsx: xlsxParser,
  csv: csvParser,
  txt: textParser,
  md: textParser,
};

const CHUNK_MAX_SIZE = 512;
const CHUNK_OVERLAP = 50;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Idempotently create the per-tenant LIST partition for knowledge.chunks.
 * Uses pg_advisory_xact_lock to guard against concurrent worker races.
 * Inlines tenantId as a quoted literal — safe because tenantId is UUID-validated above.
 */
async function ensureChunksPartition(pool: Pool, tenantId: string): Promise<void> {
  const slug = tenantId.replaceAll('-', '_');
  const childName = `chunks_${slug}`;
  const digest = createHash('sha256').update(`knowledge.chunks|${tenantId}`).digest();
  const k1 = digest.readInt32BE(0);
  const k2 = digest.readInt32BE(4);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [k1, k2]);
    const { rows } = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = $1 AND n.nspname = 'knowledge'
       ) AS exists`,
      [childName],
    );
    if (!rows[0]?.exists) {
      await client.query(
        `CREATE TABLE knowledge.${childName}
           PARTITION OF knowledge.chunks
           FOR VALUES IN ('${tenantId}'::uuid)`,
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* connection dead */
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function parseKnowledgeFile(
  payload: ParseKnowledgeFilePayload,
  deps: ParseKnowledgeFileDeps,
): Promise<void> {
  const { tenant_id, file_id } = payload;
  if (!UUID_RE.test(tenant_id)) throw new Error(`tenant_id must be a UUID, got ${tenant_id}`);

  try {
    const fileRow = await deps.pool.query<{
      s3_key: string;
      filename: string;
      status: string;
      scan_status: string;
    }>(
      `SELECT s3_key, filename, status, scan_status FROM knowledge.files
        WHERE id = $1 AND tenant_id = $2`,
      [file_id, tenant_id],
    );
    if (fileRow.rows.length === 0) return; // file gone; nothing to parse
    if (fileRow.rows[0]?.status !== 'parsing') return; // already moved on; idempotent
    if (fileRow.rows[0]?.scan_status !== 'clean') {
      throw new Error(
        `refusing to parse file ${file_id}: scan_status=${fileRow.rows[0]?.scan_status}`,
      );
    }

    const ext = fileRow.rows[0]?.filename.split('.').pop()?.toLowerCase() ?? '';
    const parser = PARSERS[ext];
    if (!parser) throw new Error(`no parser for extension: .${ext}`);

    const buf = await deps.fetchObject(fileRow.rows[0]?.s3_key);
    const parsed: ParsedDocument = await parser.parse(buf);

    // Chunk every section. page_hint passes through to the chunks table.
    const chunks: { ordinal: number; text: string; page_hint: string | null }[] = [];
    let ordinal = 0;
    for (const section of parsed.sections) {
      const subchunks = await MDocument.fromText(section.text).chunk({
        strategy: 'recursive',
        maxSize: CHUNK_MAX_SIZE,
        overlap: CHUNK_OVERLAP,
      });
      for (const sub of subchunks) {
        chunks.push({ ordinal, text: sub.text, page_hint: section.page_hint });
        ordinal += 1;
      }
    }

    if (chunks.length === 0) throw new Error('parser produced no chunks');

    // Lazily provision the per-tenant LIST partition before inserting chunks.
    await ensureChunksPartition(deps.pool, tenant_id);

    // Insert chunks, flip status, enqueue embed job — all in one tx.
    // pool.connect() pins all statements to a single connection so BEGIN/COMMIT
    // are not silently dispatched to different pool members.
    const client = await deps.pool.connect();
    try {
      await client.query('BEGIN');

      // Wipe any previous attempt's chunks (idempotent re-run).
      await client.query(`DELETE FROM knowledge.chunks WHERE tenant_id = $1 AND file_id = $2`, [
        tenant_id,
        file_id,
      ]);

      // Bulk insert.
      const placeholders = chunks
        .map((_, i) => {
          const base = 2 + i * 3;
          return `($1, $2, $${base + 1}, $${base + 2}, $${base + 3})`;
        })
        .join(', ');
      const params: unknown[] = [tenant_id, file_id];
      for (const c of chunks) params.push(c.ordinal, c.text, c.page_hint);

      await client.query(
        `INSERT INTO knowledge.chunks
           (tenant_id, file_id, chunk_ordinal, chunk_text, page_hint)
         VALUES ${placeholders}`,
        params,
      );

      await client.query(
        `UPDATE knowledge.files
            SET status = 'embedding'
          WHERE id = $1 AND tenant_id = $2`,
        [file_id, tenant_id],
      );

      await client.query('COMMIT');
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* connection dead */
      }
      throw err;
    } finally {
      client.release();
    }

    await deps.enqueueEmbedJob({ tenant_id, file_id });
  } catch (err) {
    const reason = (err as Error).message;
    await deps.pool.query(
      `UPDATE knowledge.files
          SET status = 'failed', error_reason = $1
        WHERE id = $2 AND tenant_id = $3`,
      [reason, file_id, tenant_id],
    );
    // Don't rethrow — the job is "done"; the failure is captured on the row.
    // graphile-worker would otherwise retry indefinitely, which doesn't help
    // (parser errors don't get better on retry; admin must re-upload).
  }
}
