import { randomUUID } from 'node:crypto';
import { resetCoreDb } from '@seta/core/testing';
import { resetKnowledgeDb } from '@seta/knowledge/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it, vi } from 'vitest';
import {
  ChatAttachmentError,
  deleteChatAttachment,
  listThreadAttachments,
  markChatAttachmentProcessed,
  requestChatAttachmentUpload,
} from '../../src/backend/domain/chat-attachment.ts';

const dbEnv = () => ({
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
});

const fakePresign = async () => 'https://s3.example/presigned';

describe('chat attachment domain', () => {
  it('upload sets thread_id + origin=chat and returns a presigned url', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetKnowledgeDb();
      initPools({ databaseUrl });
      try {
        const tenant_id = randomUUID();
        const thread_id = randomUUID();
        const uploaded_by = randomUUID();
        const res = await requestChatAttachmentUpload(
          {
            tenant_id,
            uploaded_by,
            thread_id,
            filename: 'spec.pdf',
            mime_type: 'application/pdf',
            size_bytes: 1024,
          },
          { bucket: 'test-bucket', presign: fakePresign },
        );
        expect(typeof res.file_id).toBe('string');
        expect(res.upload_url).toBe('https://s3.example/presigned');

        const row = await pool.query<{ thread_id: string; origin: string; status: string }>(
          `SELECT thread_id, origin, status FROM knowledge.files WHERE id = $1`,
          [res.file_id],
        );
        expect(row.rows[0]?.thread_id).toBe(thread_id);
        expect(row.rows[0]?.origin).toBe('chat');
        expect(row.rows[0]?.status).toBe('uploading');
      } finally {
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    });
  });

  it('rejects a disallowed extension', async () => {
    await withTestDb(dbEnv(), async ({ databaseUrl }) => {
      resetCoreDb();
      resetKnowledgeDb();
      initPools({ databaseUrl });
      try {
        await expect(
          requestChatAttachmentUpload(
            {
              tenant_id: randomUUID(),
              uploaded_by: randomUUID(),
              thread_id: randomUUID(),
              filename: 'malware.exe',
              mime_type: 'application/octet-stream',
              size_bytes: 1,
            },
            { bucket: 'test-bucket', presign: fakePresign },
          ),
        ).rejects.toBeInstanceOf(ChatAttachmentError);
      } finally {
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    });
  });

  it('enforces the per-thread cap', async () => {
    await withTestDb(dbEnv(), async ({ databaseUrl }) => {
      resetCoreDb();
      resetKnowledgeDb();
      initPools({ databaseUrl });
      try {
        const tenant_id = randomUUID();
        const thread_id = randomUUID();
        const uploaded_by = randomUUID();
        for (let i = 0; i < 2; i += 1) {
          await requestChatAttachmentUpload(
            {
              tenant_id,
              uploaded_by,
              thread_id,
              filename: `f${i}.pdf`,
              mime_type: 'application/pdf',
              size_bytes: 1,
            },
            { bucket: 'test-bucket', presign: fakePresign, maxPerThread: 2 },
          );
        }
        await expect(
          requestChatAttachmentUpload(
            {
              tenant_id,
              uploaded_by,
              thread_id,
              filename: 'f3.pdf',
              mime_type: 'application/pdf',
              size_bytes: 1,
            },
            { bucket: 'test-bucket', presign: fakePresign, maxPerThread: 2 },
          ),
        ).rejects.toMatchObject({ code: 'LIMIT' });
      } finally {
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    });
  });

  it('mark-processed enqueues for the owner and no-ops for a non-owner', async () => {
    await withTestDb(dbEnv(), async ({ databaseUrl }) => {
      resetCoreDb();
      resetKnowledgeDb();
      initPools({ databaseUrl });
      try {
        const tenant_id = randomUUID();
        const thread_id = randomUUID();
        const uploaded_by = randomUUID();
        const { file_id } = await requestChatAttachmentUpload(
          {
            tenant_id,
            uploaded_by,
            thread_id,
            filename: 'a.pdf',
            mime_type: 'application/pdf',
            size_bytes: 1,
          },
          { bucket: 'test-bucket', presign: fakePresign },
        );

        const enqueue = vi.fn(async () => {});
        await markChatAttachmentProcessed(
          { tenant_id, file_id, uploaded_by: randomUUID() },
          { enqueueScanJob: enqueue },
        );
        expect(enqueue).not.toHaveBeenCalled();

        await markChatAttachmentProcessed(
          { tenant_id, file_id, uploaded_by },
          { enqueueScanJob: enqueue },
        );
        expect(enqueue).toHaveBeenCalledTimes(1);
      } finally {
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    });
  });

  it("lists a thread's attachments and deletes only the owner's file", async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetKnowledgeDb();
      initPools({ databaseUrl });
      try {
        const tenant_id = randomUUID();
        const thread_id = randomUUID();
        const uploaded_by = randomUUID();
        const { file_id } = await requestChatAttachmentUpload(
          {
            tenant_id,
            uploaded_by,
            thread_id,
            filename: 'keep.pdf',
            mime_type: 'application/pdf',
            size_bytes: 1,
          },
          { bucket: 'test-bucket', presign: fakePresign },
        );

        const list = await listThreadAttachments({ tenant_id, thread_id });
        expect(list.map((a) => a.filename)).toContain('keep.pdf');

        // non-owner delete is a no-op
        await deleteChatAttachment(
          { tenant_id, file_id, uploaded_by: randomUUID() },
          { deleteS3Object: async () => {} },
        );
        let remaining = await pool.query(`SELECT 1 FROM knowledge.files WHERE id = $1`, [file_id]);
        expect(remaining.rows).toHaveLength(1);

        // owner delete removes it
        await deleteChatAttachment(
          { tenant_id, file_id, uploaded_by },
          { deleteS3Object: async () => {} },
        );
        remaining = await pool.query(`SELECT 1 FROM knowledge.files WHERE id = $1`, [file_id]);
        expect(remaining.rows).toHaveLength(0);
      } finally {
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    });
  });
});
