import {
  deleteKnowledgeFile,
  listKnowledgeFiles,
  markKnowledgeFileProcessed,
  requestKnowledgeUpload,
} from '@seta/copilot';
import { resetCoreDb } from '@seta/core/internal/test-support';
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
      initPools({ databaseUrl });
      try {
        return await fn({ pool });
      } finally {
        resetCoreDb();
        await closePools();
      }
    },
  );

describe('knowledge file lifecycle', () => {
  it('flips status to parsing and enqueues parse job on markProcessed', () =>
    withDb(async ({ pool }) => {
      const presign = vi.fn(async () => 'https://signed');
      const enqueueParseJob = vi.fn(async () => {});
      const tenantId = crypto.randomUUID();
      const { file_id } = await requestKnowledgeUpload(
        {
          tenant_id: tenantId,
          uploaded_by: crypto.randomUUID(),
          filename: 'x.pdf',
          mime_type: 'application/pdf',
          size_bytes: 100,
        },
        { bucket: 'b', presign: presign as never },
      );

      await markKnowledgeFileProcessed({ tenant_id: tenantId, file_id }, { enqueueParseJob });

      const row = await pool.query<{ status: string }>(
        `SELECT status FROM copilot.tenant_knowledge_files WHERE id = $1`,
        [file_id],
      );
      expect(row.rows[0]?.status).toBe('parsing');
      expect(enqueueParseJob).toHaveBeenCalledOnce();
      expect(enqueueParseJob).toHaveBeenCalledWith({ tenant_id: tenantId, file_id });
    }));

  it('does NOT enqueue when status was not uploading (row already past uploading)', () =>
    withDb(async ({ pool }) => {
      const presign = vi.fn(async () => 'https://signed');
      const enqueueParseJob = vi.fn(async () => {});
      const tenantId = crypto.randomUUID();
      const { file_id } = await requestKnowledgeUpload(
        {
          tenant_id: tenantId,
          uploaded_by: crypto.randomUUID(),
          filename: 'x.pdf',
          mime_type: 'application/pdf',
          size_bytes: 100,
        },
        { bucket: 'b', presign: presign as never },
      );

      // Manually set status to 'parsing' so the UPDATE WHERE status='uploading' won't match
      await pool.query(
        `UPDATE copilot.tenant_knowledge_files SET status = 'parsing' WHERE id = $1`,
        [file_id],
      );

      await markKnowledgeFileProcessed({ tenant_id: tenantId, file_id }, { enqueueParseJob });

      expect(enqueueParseJob).not.toHaveBeenCalled();
    }));

  it('lists files ordered by created_at DESC', () =>
    withDb(async () => {
      const presign = vi.fn(async () => 'https://signed');
      const tenantId = crypto.randomUUID();
      const a = await requestKnowledgeUpload(
        {
          tenant_id: tenantId,
          uploaded_by: crypto.randomUUID(),
          filename: 'a.pdf',
          mime_type: 'application/pdf',
          size_bytes: 1,
        },
        { bucket: 'b', presign: presign as never },
      );
      const b = await requestKnowledgeUpload(
        {
          tenant_id: tenantId,
          uploaded_by: crypto.randomUUID(),
          filename: 'b.pdf',
          mime_type: 'application/pdf',
          size_bytes: 1,
        },
        { bucket: 'b', presign: presign as never },
      );

      const list = await listKnowledgeFiles({ tenant_id: tenantId, limit: 10 });
      expect(list.map((f) => f.file_id)).toEqual([b.file_id, a.file_id]);
    }));

  it('deletes by id and is gone from list', () =>
    withDb(async () => {
      const presign = vi.fn(async () => 'https://signed');
      const tenantId = crypto.randomUUID();
      const { file_id } = await requestKnowledgeUpload(
        {
          tenant_id: tenantId,
          uploaded_by: crypto.randomUUID(),
          filename: 'x.pdf',
          mime_type: 'application/pdf',
          size_bytes: 1,
        },
        { bucket: 'b', presign: presign as never },
      );

      await deleteKnowledgeFile({ tenant_id: tenantId, file_id });

      const list = await listKnowledgeFiles({ tenant_id: tenantId, limit: 10 });
      expect(list).toEqual([]);
    }));
});
