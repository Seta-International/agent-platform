import { randomUUID } from 'node:crypto';
import { resetCoreDb } from '@seta/core/testing';
import { deleteKnowledgeFile } from '@seta/knowledge';
import { resetKnowledgeDb } from '@seta/knowledge/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it, vi } from 'vitest';

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

async function seedFileWithChunks(
  pool: import('pg').Pool,
  tenant_id: string,
  chunks: { text: string; page_hint: string | null }[],
): Promise<string> {
  const slug = tenant_id.replaceAll('-', '_');
  const childName = `chunks_${slug}`;
  const { rows: existing } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = $1 AND n.nspname = 'copilot'
     ) AS exists`,
    [childName],
  );
  if (!existing[0]?.exists) {
    await pool.query(
      `CREATE TABLE knowledge.${childName}
         PARTITION OF knowledge.chunks
         FOR VALUES IN ('${tenant_id}'::uuid)`,
    );
  }

  const fileId = (
    await pool.query<{ id: string }>(
      `INSERT INTO knowledge.files
         (tenant_id, uploaded_by, filename, mime_type, size_bytes, s3_key, status)
       VALUES ($1, $2, 't.txt', 'text/plain', 1, $3, 'ready')
       RETURNING id`,
      [tenant_id, randomUUID(), `tenants/${tenant_id}/knowledge/${randomUUID()}/t.txt`],
    )
  ).rows[0]!.id;

  for (let i = 0; i < chunks.length; i += 1) {
    await pool.query(
      `INSERT INTO knowledge.chunks (tenant_id, file_id, chunk_ordinal, chunk_text, page_hint)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenant_id, fileId, i, chunks[i]!.text, chunks[i]!.page_hint],
    );
  }

  return fileId;
}

describe('deleteKnowledgeFile cleanup', () => {
  it('removes the file row, chunks, embeddings, and S3 object', async () => {
    await withDb(async ({ pool }) => {
      const tenant_id = randomUUID();
      const file_id = await seedFileWithChunks(pool, tenant_id, [
        { text: 'chunk one', page_hint: 'p.1' },
        { text: 'chunk two', page_hint: 'p.2' },
      ]);

      const deleteS3 = vi.fn(async () => {});
      await deleteKnowledgeFile({ tenant_id, file_id }, { deleteS3Object: deleteS3 });

      expect(deleteS3).toHaveBeenCalledOnce();

      const fileRows = await pool.query(`SELECT id FROM knowledge.files WHERE id = $1`, [file_id]);
      expect(fileRows.rows).toHaveLength(0);

      const chunkRows = await pool.query(
        `SELECT chunk_ordinal FROM knowledge.chunks WHERE tenant_id = $1 AND file_id = $2`,
        [tenant_id, file_id],
      );
      expect(chunkRows.rows).toHaveLength(0);
    });
  });

  it('is idempotent — double delete does not throw', async () => {
    await withDb(async ({ pool }) => {
      const tenant_id = randomUUID();
      const file_id = await seedFileWithChunks(pool, tenant_id, [{ text: 'x', page_hint: null }]);

      const deleteS3 = vi.fn(async () => {});
      await deleteKnowledgeFile({ tenant_id, file_id }, { deleteS3Object: deleteS3 });
      await expect(
        deleteKnowledgeFile({ tenant_id, file_id }, { deleteS3Object: deleteS3 }),
      ).resolves.toBeUndefined();

      expect(deleteS3).toHaveBeenCalledOnce();
    });
  });
});
