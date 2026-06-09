import { randomUUID } from 'node:crypto';
import { resetCoreDb } from '@seta/core/testing';
import { resetKnowledgeDb } from '@seta/knowledge/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { ChatAttachmentError } from '../../../src/backend/domain/chat-attachment.ts';
import { registerKnowledgeRoutes } from '../../../src/backend/http/index.ts';

const dbEnv = () => ({
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
});

const fakePresign = async () => 'https://s3.example/presigned';
const fakeWorkers = { addJob: vi.fn(async () => {}), shutdown: async () => {} };

function buildApp(
  session: {
    tenant_id: string;
    user_id: string;
    effective_permissions: Set<string>;
  } | null,
  // Default: skip the S3 parse-probe in unit tests (no S3 here).
  assertReadable: (i: {
    tenant_id: string;
    file_id: string;
    uploaded_by: string;
  }) => Promise<void> = async () => {},
) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    if (session) c.set('session' as never, session as never);
    await next();
  });
  registerKnowledgeRoutes(app as never, {
    workers: fakeWorkers,
    presign: fakePresign,
    assertReadable,
  });
  return app;
}

const member = (tenant_id: string, user_id: string) => ({
  tenant_id,
  user_id,
  effective_permissions: new Set(['knowledge.chat_attachment.write']),
  role_summary: { roles: ['org.member'], cross_tenant_read: false },
});

describe('chat attachment routes', () => {
  it('member can request an upload url', async () => {
    await withTestDb(dbEnv(), async ({ databaseUrl }) => {
      resetCoreDb();
      resetKnowledgeDb();
      initPools({ databaseUrl });
      try {
        const app = buildApp(member(randomUUID(), randomUUID()));
        const res = await app.request('/api/agent/v1/knowledge/attachments/upload-url', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            thread_id: randomUUID(),
            filename: 'spec.pdf',
            mime_type: 'application/pdf',
            size_bytes: 1024,
          }),
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { file_id: string; upload_url: string };
        expect(typeof body.file_id).toBe('string');
        expect(body.upload_url).toBe('https://s3.example/presigned');
      } finally {
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    });
  });

  it('returns 403 without the permission', async () => {
    await withTestDb(dbEnv(), async ({ databaseUrl }) => {
      resetCoreDb();
      resetKnowledgeDb();
      initPools({ databaseUrl });
      try {
        const app = buildApp({
          tenant_id: randomUUID(),
          user_id: randomUUID(),
          effective_permissions: new Set<string>(),
        });
        const res = await app.request('/api/agent/v1/knowledge/attachments/upload-url', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            thread_id: randomUUID(),
            filename: 'x.pdf',
            mime_type: 'application/pdf',
            size_bytes: 1,
          }),
        });
        expect(res.status).toBe(403);
      } finally {
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    });
  });

  it('/processed returns 400 when the file is not readable', async () => {
    await withTestDb(dbEnv(), async ({ databaseUrl }) => {
      resetCoreDb();
      resetKnowledgeDb();
      initPools({ databaseUrl });
      try {
        const tenant_id = randomUUID();
        const user_id = randomUUID();
        // assertReadable rejects like a corrupt file would
        const app = buildApp(member(tenant_id, user_id), async () => {
          throw new ChatAttachmentError(
            'VALIDATION',
            'could not read "broken.pdf": Invalid PDF structure.',
          );
        });
        const res = await app.request('/api/agent/v1/knowledge/attachments/42/processed', {
          method: 'POST',
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string; message: string };
        expect(body.message).toMatch(/Invalid PDF/);
      } finally {
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    });
  });

  it('returns 401 without a session', async () => {
    await withTestDb(dbEnv(), async ({ databaseUrl }) => {
      resetCoreDb();
      resetKnowledgeDb();
      initPools({ databaseUrl });
      try {
        const app = buildApp(null);
        const res = await app.request('/api/agent/v1/knowledge/attachments/upload-url', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            thread_id: randomUUID(),
            filename: 'x.pdf',
            mime_type: 'application/pdf',
            size_bytes: 1,
          }),
        });
        expect(res.status).toBe(401);
      } finally {
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    });
  });
});
