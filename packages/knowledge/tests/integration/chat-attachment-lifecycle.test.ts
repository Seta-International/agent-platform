import { resetCoreDb } from '@seta/core/testing';
import {
  listPendingThreadAttachments,
  markAttachmentsConsumed,
  markChatAttachmentUploaded,
  requestChatAttachmentUpload,
  threadPendingBytes,
} from '@seta/knowledge';
import { resetKnowledgeDb } from '@seta/knowledge/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it, vi } from 'vitest';

const TENANT = '00000000-0000-0000-0000-000000000000';
const USER = '00000000-0000-0000-0000-000000000099';
const THREAD = '11111111-1111-1111-1111-111111111111';

const withDb = <T>(fn: (ctx: { pool: import('pg').Pool }) => Promise<T>) =>
  withTestDb(
    {
      templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
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

async function upload(name: string, bytes: number) {
  return requestChatAttachmentUpload(
    {
      tenant_id: TENANT,
      uploaded_by: USER,
      thread_id: THREAD,
      filename: name,
      mime_type: 'text/plain',
      size_bytes: bytes,
    },
    { bucket: 'b', presign: vi.fn(async () => 'https://s3/u') },
  );
}

describe('chat attachment lifecycle', () => {
  it('uploaded files are pending; consumed files are not', () =>
    withDb(async () => {
      const a = await upload('a.txt', 10);
      const b = await upload('b.txt', 20);
      // before markUploaded, status is 'uploading' → not pending
      expect(
        await listPendingThreadAttachments({ tenant_id: TENANT, thread_id: THREAD }),
      ).toHaveLength(0);

      await markChatAttachmentUploaded({
        tenant_id: TENANT,
        file_id: a.file_id,
        uploaded_by: USER,
      });
      await markChatAttachmentUploaded({
        tenant_id: TENANT,
        file_id: b.file_id,
        uploaded_by: USER,
      });
      const pending = await listPendingThreadAttachments({ tenant_id: TENANT, thread_id: THREAD });
      expect(pending.map((p) => p.filename).sort()).toEqual(['a.txt', 'b.txt']);
      expect(pending[0]!.s3_key).toBeTruthy();

      await markAttachmentsConsumed([a.file_id]);
      const stillPending = await listPendingThreadAttachments({
        tenant_id: TENANT,
        thread_id: THREAD,
      });
      expect(stillPending.map((p) => p.filename)).toEqual(['b.txt']);
    }));

  it('threadPendingBytes sums uploading + uploaded, excludes consumed', () =>
    withDb(async () => {
      const a = await upload('a.txt', 10);
      const _b = await upload('b.txt', 20);
      await markChatAttachmentUploaded({
        tenant_id: TENANT,
        file_id: a.file_id,
        uploaded_by: USER,
      });
      expect(await threadPendingBytes({ tenant_id: TENANT, thread_id: THREAD })).toBe(30);
      await markAttachmentsConsumed([a.file_id]);
      expect(await threadPendingBytes({ tenant_id: TENANT, thread_id: THREAD })).toBe(20);
    }));

  it('markAttachmentsConsumed is idempotent and only affects uploaded rows', () =>
    withDb(async () => {
      const a = await upload('a.txt', 10);
      await markChatAttachmentUploaded({
        tenant_id: TENANT,
        file_id: a.file_id,
        uploaded_by: USER,
      });
      await markAttachmentsConsumed([a.file_id]);
      await markAttachmentsConsumed([a.file_id]); // second pass is a no-op
      expect(
        await listPendingThreadAttachments({ tenant_id: TENANT, thread_id: THREAD }),
      ).toHaveLength(0);
    }));
});
