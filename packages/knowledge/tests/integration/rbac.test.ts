import { resetCoreDb } from '@seta/core/testing';
import { resetKnowledgeDb } from '@seta/knowledge/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { deleteKnowledgeFile } from '../../src/backend/domain/delete-file.ts';
import { markKnowledgeFileProcessed } from '../../src/backend/domain/mark-processed.ts';
import { requestKnowledgeUpload } from '../../src/backend/domain/upload-url.ts';
import { KnowledgeError, requirePermission } from '../../src/backend/rbac.ts';
import { buildTestSession, permsFor } from '../helpers/session.ts';

const withDb = <T>(fn: () => Promise<T>) =>
  withTestDb(
    {
      templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
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

  describe('fine-grained resolution via resolved permissions', () => {
    it('knowledge.viewer can read but not write', () => {
      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const session = {
        session_id: crypto.randomUUID(),
        user_id: userId,
        tenant_id: tenantId,
        email: 'viewer@example.test',
        display_name: 'Viewer',
        role_summary: { roles: ['knowledge.viewer'], cross_tenant_read: false },
        role_summary_hash: 'h',
        permissions: permsFor(['knowledge.viewer']),
        accessible_group_ids: [] as string[],
        cross_tenant_read: false,
        built_at: new Date(),
        invalidated_at: null,
      };

      expect(() => requirePermission(session, 'knowledge.file.read')).not.toThrow();
      expect(() => requirePermission(session, 'knowledge.file.write')).toThrow(KnowledgeError);
      expect(() => requirePermission(session, 'knowledge.file.delete')).toThrow(KnowledgeError);
    });

    it('knowledge.member can read, write, and delete', () => {
      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const session = {
        session_id: crypto.randomUUID(),
        user_id: userId,
        tenant_id: tenantId,
        email: 'member@example.test',
        display_name: 'Member',
        role_summary: { roles: ['knowledge.member'], cross_tenant_read: false },
        role_summary_hash: 'h',
        permissions: permsFor(['knowledge.member']),
        accessible_group_ids: [] as string[],
        cross_tenant_read: false,
        built_at: new Date(),
        invalidated_at: null,
      };

      expect(() => requirePermission(session, 'knowledge.file.read')).not.toThrow();
      expect(() => requirePermission(session, 'knowledge.file.write')).not.toThrow();
      expect(() => requirePermission(session, 'knowledge.file.delete')).not.toThrow();
    });
  });
});
