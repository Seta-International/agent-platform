import { randomUUID } from 'node:crypto';
import { resetCoreDb } from '@seta/core/testing';
import { resetKnowledgeDb } from '@seta/knowledge/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it, vi } from 'vitest';
import { parseKnowledgeFile } from './parse-knowledge-file.ts';

const withDb = <T>(fn: (ctx: { pool: import('pg').Pool }) => Promise<T>) =>
  withTestDb(
    {
      templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.SETA_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetKnowledgeDb();
      initPools({ databaseUrl });
      try {
        return await fn({ pool });
      } finally {
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    },
  );

const fakeFetchObject = async () => Buffer.from('Hello world. This is a test document.', 'utf-8');

describe('parseKnowledgeFile worker', () => {
  it('parses → chunks → inserts → flips status to embedding', async () => {
    await withDb(async ({ pool }) => {
      const tenant_id = randomUUID();
      const enqueue = vi.fn(async () => {});

      const fileId = await pool
        .query<{ id: string }>(
          `INSERT INTO knowledge.files
             (tenant_id, uploaded_by, filename, mime_type, size_bytes, s3_key, status)
           VALUES ($1, $2, 'note.txt', 'text/plain', 100, 'tenants/x/knowledge/1/note.txt', 'parsing')
           RETURNING id`,
          [tenant_id, randomUUID()],
        )
        .then((r) => r.rows[0]!.id);

      await parseKnowledgeFile(
        { tenant_id, file_id: fileId, event_id: randomUUID() },
        { pool, fetchObject: fakeFetchObject, enqueueEmbedJob: enqueue },
      );

      const chunks = await pool.query(
        `SELECT * FROM knowledge.chunks WHERE tenant_id = $1 AND file_id = $2`,
        [tenant_id, fileId],
      );
      expect(chunks.rows.length).toBeGreaterThan(0);

      const status = await pool.query<{ status: string }>(
        `SELECT status FROM knowledge.files WHERE id = $1`,
        [fileId],
      );
      expect(status.rows[0]?.status).toBe('embedding');
      expect(enqueue).toHaveBeenCalledOnce();
    });
  });

  it('flips status=failed and stores error_reason on parser error', async () => {
    await withDb(async ({ pool }) => {
      const tenant_id = randomUUID();
      const fileId = await pool
        .query<{ id: string }>(
          `INSERT INTO knowledge.files
             (tenant_id, uploaded_by, filename, mime_type, size_bytes, s3_key, status)
           VALUES ($1, $2, 'broken.pdf', 'application/pdf', 1, 'tenants/x/knowledge/2/broken.pdf', 'parsing')
           RETURNING id`,
          [tenant_id, randomUUID()],
        )
        .then((r) => r.rows[0]!.id);

      const fetchObject = async () => {
        throw new Error('S3 not found');
      };
      const enqueue = vi.fn(async () => {});

      await expect(
        parseKnowledgeFile(
          { tenant_id, file_id: fileId, event_id: randomUUID() },
          { pool, fetchObject, enqueueEmbedJob: enqueue },
        ),
      ).resolves.toBeUndefined();

      const row = await pool.query<{ status: string; error_reason: string | null }>(
        `SELECT status, error_reason FROM knowledge.files WHERE id = $1`,
        [fileId],
      );
      expect(row.rows[0]?.status).toBe('failed');
      expect(row.rows[0]?.error_reason).toContain('S3 not found');
      expect(enqueue).not.toHaveBeenCalled();
    });
  });
});
