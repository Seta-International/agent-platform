import { randomUUID } from 'node:crypto';
import { resetCoreDb } from '@seta/core/testing';
import { resetKnowledgeDb } from '@seta/knowledge/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  assertChatAttachmentReadable,
  ChatAttachmentError,
  deleteChatAttachment,
  listPendingThreadAttachments,
  markAttachmentsFailed,
  markChatAttachmentUploaded,
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

  it('assertChatAttachmentReadable rejects a corrupt file and marks it failed', async () => {
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
            filename: 'broken.pdf',
            mime_type: 'application/pdf',
            size_bytes: 10,
          },
          { bucket: 'test-bucket', presign: fakePresign },
        );
        // Inject S3 fetch returning a corrupt PDF; real extract (pdfParser) throws.
        const err = await assertChatAttachmentReadable(
          { tenant_id, file_id, uploaded_by },
          { fetchObject: async () => Buffer.from('%PDF-1.4 totally broken') },
        ).catch((e) => e);
        expect(err).toBeInstanceOf(ChatAttachmentError);
        expect((err as ChatAttachmentError).code).toBe('VALIDATION');
        // marked failed → no longer pending
        expect(await listPendingThreadAttachments({ tenant_id, thread_id })).toHaveLength(0);
        const row = await pool.query<{ status: string }>(
          `SELECT status FROM knowledge.files WHERE id = $1`,
          [file_id],
        );
        expect(row.rows[0]?.status).toBe('failed');
      } finally {
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    });
  });

  it('assertChatAttachmentReadable passes a readable file (no throw, stays uploading)', async () => {
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
            filename: 'notes.txt',
            mime_type: 'text/plain',
            size_bytes: 5,
          },
          { bucket: 'test-bucket', presign: fakePresign },
        );
        await assertChatAttachmentReadable(
          { tenant_id, file_id, uploaded_by },
          { fetchObject: async () => Buffer.from('the meeting is friday') },
        );
        const row = await pool.query<{ status: string }>(
          `SELECT status FROM knowledge.files WHERE id = $1`,
          [file_id],
        );
        expect(row.rows[0]?.status).toBe('uploading'); // assert doesn't flip; /processed does
      } finally {
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    });
  });

  it('marks an uploaded file failed so it drops out of the pending list', async () => {
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
            filename: 'broken.pdf',
            mime_type: 'application/pdf',
            size_bytes: 1,
          },
          { bucket: 'test-bucket', presign: fakePresign },
        );
        await markChatAttachmentUploaded({ tenant_id, file_id, uploaded_by });
        // sanity: it is pending while 'uploaded'
        expect(await listPendingThreadAttachments({ tenant_id, thread_id })).toHaveLength(1);

        await markAttachmentsFailed([file_id], 'Invalid PDF structure.');

        // no longer pending — future turns won't re-parse it
        expect(await listPendingThreadAttachments({ tenant_id, thread_id })).toHaveLength(0);
        const row = await pool.query<{ status: string; error_reason: string | null }>(
          `SELECT status, error_reason FROM knowledge.files WHERE id = $1`,
          [file_id],
        );
        expect(row.rows[0]?.status).toBe('failed');
        expect(row.rows[0]?.error_reason).toBe('Invalid PDF structure.');
      } finally {
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    });
  });

  it("deletes only the owner's file", async () => {
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
