import { resetCoreDb } from '@seta/core/testing';
import { requestKnowledgeUpload } from '@seta/knowledge';
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

describe('requestKnowledgeUpload', () => {
  it('inserts file row with status="uploading" and returns presigned URL + file_id', () =>
    withDb(async ({ pool }) => {
      const presign = vi.fn(async () => 'https://s3/signed?X');
      const result = await requestKnowledgeUpload(
        {
          tenant_id: '00000000-0000-0000-0000-000000000000',
          uploaded_by: '00000000-0000-0000-0000-000000000099',
          filename: 'handbook.pdf',
          mime_type: 'application/pdf',
          size_bytes: 1024 * 1024,
        },
        {
          bucket: 'test-bucket',
          presign: presign as never,
        },
      );

      expect(result.upload_url).toBe('https://s3/signed?X');
      expect(result.file_id).toMatch(/^\d+$/);
      expect(presign).toHaveBeenCalledOnce();

      const row = await pool.query<{ status: string; s3_key: string }>(
        `SELECT status, s3_key FROM knowledge.files WHERE id = $1`,
        [result.file_id],
      );
      expect(row.rows[0]?.status).toBe('uploading');
      expect(row.rows[0]?.s3_key).toContain('handbook.pdf');
    }));

  it('rejects extensions outside the allowlist', () =>
    withDb(async () => {
      await expect(
        requestKnowledgeUpload(
          {
            tenant_id: crypto.randomUUID(),
            uploaded_by: crypto.randomUUID(),
            filename: 'evil.exe',
            mime_type: 'application/x-msdownload',
            size_bytes: 1,
          },
          { bucket: 'b', presign: (async () => '') as never },
        ),
      ).rejects.toThrow(/file type not allowed/i);
    }));

  it('rejects file size > 50MB', () =>
    withDb(async () => {
      await expect(
        requestKnowledgeUpload(
          {
            tenant_id: crypto.randomUUID(),
            uploaded_by: crypto.randomUUID(),
            filename: 'big.pdf',
            mime_type: 'application/pdf',
            size_bytes: 51 * 1024 * 1024,
          },
          { bucket: 'b', presign: (async () => '') as never },
        ),
      ).rejects.toThrow(/size/i);
    }));
});
