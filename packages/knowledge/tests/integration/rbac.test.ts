import { resetCoreDb } from '@seta/core/testing';
import { resetKnowledgeDb } from '@seta/knowledge/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { deleteKnowledgeFile } from '../../src/backend/domain/delete-file.ts';
import { markKnowledgeFileProcessed } from '../../src/backend/domain/mark-processed.ts';
import { requestKnowledgeUpload } from '../../src/backend/domain/upload-url.ts';
import { KnowledgeError } from '../../src/backend/rbac.ts';
import { buildTestSession } from '../helpers/session.ts';

const withDb = <T>(fn: () => Promise<T>) =>
  withTestDb(
    {
      templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.SETA_TEST_PG_BASE as string,
    },
    async ({ databaseUrl }) => {
      resetCoreDb();
      resetKnowledgeDb();
      initPools({ databaseUrl });
      try {
        return await fn();
      } finally {
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    },
  );

describe('knowledge RBAC', () => {
  it('rejects requestKnowledgeUpload without knowledge.file.write', () =>
    withDb(async () => {
      const tenantId = crypto.randomUUID();
      const viewer = buildTestSession({ tenant_id: tenantId, roles: ['knowledge.viewer'] });
      await expect(
        requestKnowledgeUpload(
          {
            tenant_id: tenantId,
            uploaded_by: viewer.user_id,
            filename: 'x.pdf',
            mime_type: 'application/pdf',
            size_bytes: 1024,
          },
          { bucket: 'test', session: viewer, presign: (async () => '') as never },
        ),
      ).rejects.toBeInstanceOf(KnowledgeError);
    }));

  it('rejects markKnowledgeFileProcessed without knowledge.file.write', () =>
    withDb(async () => {
      const tenantId = crypto.randomUUID();
      const viewer = buildTestSession({ tenant_id: tenantId, roles: ['knowledge.viewer'] });
      await expect(
        markKnowledgeFileProcessed(
          { tenant_id: tenantId, file_id: '1' },
          { session: viewer, enqueueScanJob: async () => {} },
        ),
      ).rejects.toBeInstanceOf(KnowledgeError);
    }));

  it('rejects deleteKnowledgeFile without knowledge.file.delete', () =>
    withDb(async () => {
      const tenantId = crypto.randomUUID();
      const member = buildTestSession({ tenant_id: tenantId, roles: ['knowledge.viewer'] });
      await expect(
        deleteKnowledgeFile(
          { tenant_id: tenantId, file_id: '1' },
          { session: member, deleteS3Object: async () => {} },
        ),
      ).rejects.toBeInstanceOf(KnowledgeError);
    }));

  it('org.admin bypasses all permission checks', () =>
    withDb(async () => {
      const tenantId = crypto.randomUUID();
      const admin = buildTestSession({ tenant_id: tenantId, roles: ['org.admin'] });
      const result = await requestKnowledgeUpload(
        {
          tenant_id: tenantId,
          uploaded_by: admin.user_id,
          filename: 'ok.pdf',
          mime_type: 'application/pdf',
          size_bytes: 10,
        },
        { bucket: 'test', session: admin, presign: (async () => 'https://s3') as never },
      );
      expect(result.file_id).toMatch(/^\d+$/);
    }));

  it('knowledge.member grants write/delete', () =>
    withDb(async () => {
      const tenantId = crypto.randomUUID();
      const member = buildTestSession({ tenant_id: tenantId, roles: ['knowledge.member'] });
      const result = await requestKnowledgeUpload(
        {
          tenant_id: tenantId,
          uploaded_by: member.user_id,
          filename: 'ok.pdf',
          mime_type: 'application/pdf',
          size_bytes: 10,
        },
        { bucket: 'test', session: member, presign: (async () => 'https://s3') as never },
      );
      expect(result.file_id).toMatch(/^\d+$/);
    }));
});
