import { resetCoreDb } from '@seta/core/testing';
import {
  deleteKnowledgeFile,
  listKnowledgeFiles,
  markKnowledgeFileProcessed,
  requestKnowledgeUpload,
} from '@seta/knowledge';
import { resetKnowledgeDb } from '@seta/knowledge/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it, vi } from 'vitest';
import { buildTestSession } from '../helpers/session.ts';

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

describe('knowledge file lifecycle', () => {
  it('enqueues scan job on markProcessed; status stays uploading until scan clears', () =>
    withDb(async ({ pool }) => {
      const presign = vi.fn(async () => 'https://signed');
      const enqueueScanJob = vi.fn(async () => {});
      const tenantId = crypto.randomUUID();
      const { file_id } = await requestKnowledgeUpload(
        {
          tenant_id: tenantId,
          uploaded_by: crypto.randomUUID(),
          filename: 'x.pdf',
          mime_type: 'application/pdf',
          size_bytes: 100,
        },
        {
          bucket: 'b',
          session: buildTestSession({ tenant_id: tenantId }),
          presign: presign as never,
        },
      );

      await markKnowledgeFileProcessed(
        { tenant_id: tenantId, file_id },
        { session: buildTestSession({ tenant_id: tenantId }), enqueueScanJob },
      );

      const row = await pool.query<{ status: string }>(
        `SELECT status FROM knowledge.files WHERE id = $1`,
        [file_id],
      );
      expect(row.rows[0]?.status).toBe('uploading');
      expect(enqueueScanJob).toHaveBeenCalledOnce();
      expect(enqueueScanJob).toHaveBeenCalledWith({
        tenant_id: tenantId,
        file_id,
        s3_key: expect.stringContaining('x.pdf'),
      });
    }));

  it('does NOT enqueue when status was not uploading (row already past uploading)', () =>
    withDb(async ({ pool }) => {
      const presign = vi.fn(async () => 'https://signed');
      const enqueueScanJob = vi.fn(async () => {});
      const tenantId = crypto.randomUUID();
      const { file_id } = await requestKnowledgeUpload(
        {
          tenant_id: tenantId,
          uploaded_by: crypto.randomUUID(),
          filename: 'x.pdf',
          mime_type: 'application/pdf',
          size_bytes: 100,
        },
        {
          bucket: 'b',
          session: buildTestSession({ tenant_id: tenantId }),
          presign: presign as never,
        },
      );

      // Manually set status to 'parsing' so the guard skips
      await pool.query(`UPDATE knowledge.files SET status = 'parsing' WHERE id = $1`, [file_id]);

      await markKnowledgeFileProcessed(
        { tenant_id: tenantId, file_id },
        { session: buildTestSession({ tenant_id: tenantId }), enqueueScanJob },
      );

      expect(enqueueScanJob).not.toHaveBeenCalled();
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
        {
          bucket: 'b',
          session: buildTestSession({ tenant_id: tenantId }),
          presign: presign as never,
        },
      );
      const b = await requestKnowledgeUpload(
        {
          tenant_id: tenantId,
          uploaded_by: crypto.randomUUID(),
          filename: 'b.pdf',
          mime_type: 'application/pdf',
          size_bytes: 1,
        },
        {
          bucket: 'b',
          session: buildTestSession({ tenant_id: tenantId }),
          presign: presign as never,
        },
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
        {
          bucket: 'b',
          session: buildTestSession({ tenant_id: tenantId }),
          presign: presign as never,
        },
      );

      await deleteKnowledgeFile(
        { tenant_id: tenantId, file_id },
        { session: buildTestSession({ tenant_id: tenantId }) },
      );

      const list = await listKnowledgeFiles({ tenant_id: tenantId, limit: 10 });
      expect(list).toEqual([]);
    }));
});
