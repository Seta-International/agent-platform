import { hashRoleSummary, type SessionEnv, type SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { createUser, IdentityError } from '@seta/identity';
import { resetKnowledgeDb } from '@seta/knowledge/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { describe, expect, it, vi } from 'vitest';
import { requestKnowledgeUpload } from '../domain/upload-url.ts';
import { registerKnowledgeRoutes } from './index.ts';

function handleKnowledgeError(
  err: Error,
  c: Parameters<Parameters<Hono<SessionEnv>['onError']>[0]>[1],
): Response {
  if (err instanceof IdentityError) {
    const status: ContentfulStatusCode =
      err.code === 'FORBIDDEN' ? 403 : err.code === 'USER_NOT_FOUND' ? 404 : 400;
    return c.json({ error: err.code, message: err.message }, status);
  }
  throw err;
}

function buildSession(opts: {
  tenant_id: string;
  user_id: string;
  email: string;
  display_name: string;
  roles?: string[];
}): SessionScope {
  const role_summary = { roles: opts.roles ?? ['org.admin'], cross_tenant_read: false };
  return {
    session_id: crypto.randomUUID(),
    user_id: opts.user_id,
    tenant_id: opts.tenant_id,
    email: opts.email,
    display_name: opts.display_name,
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    accessible_group_ids: [],
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };
}

const fakePresign = async () => 'https://s3.example/presigned';
const fakeWorkers = { addJob: vi.fn(async () => {}), shutdown: async () => {} };

function buildTestApp(session: SessionScope): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', session);
    await next();
  });
  registerKnowledgeRoutes(app, { workers: fakeWorkers, presign: fakePresign });
  app.onError(handleKnowledgeError);
  return app;
}

const dbEnv = () => ({
  templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.SETA_TEST_PG_BASE as string,
});

async function seedTenant(pool: import('pg').Pool, slug: string) {
  const tenantId = crypto.randomUUID();
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
    tenantId,
    `Tenant ${slug}`,
    slug,
  ]);
  const adminEmail = `admin-${slug}@example.test`;
  const adminResult = await createUser(
    {
      tenant_id: tenantId,
      email: adminEmail,
      name: 'Admin',
      password: 'correct-horse-battery-staple',
      initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
    },
    { type: 'cli', user_id: null },
  );
  return { tenantId, adminUserId: adminResult.user_id, adminEmail };
}

describe('GET /api/copilot/v1/knowledge — role check', () => {
  it('returns 403 when user is not org.admin', async () => {
    await withTestDb(dbEnv(), async ({ databaseUrl }) => {
      resetCoreDb();
      resetKnowledgeDb();
      initPools({ databaseUrl });
      try {
        const session = buildSession({
          tenant_id: crypto.randomUUID(),
          user_id: crypto.randomUUID(),
          email: 'member@example.test',
          display_name: 'Member',
          roles: ['org.member'],
        });
        const app = buildTestApp(session);
        const res = await app.request('/api/copilot/v1/knowledge');
        expect(res.status).toBe(403);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe('FORBIDDEN');
      } finally {
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    });
  });
});

describe('POST /api/copilot/v1/knowledge/upload-url', () => {
  it('returns 200 with upload_url and file_id on valid input', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetKnowledgeDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'upload-ok');
        const session = buildSession({
          tenant_id: tenantId,
          user_id: adminUserId,
          email: adminEmail,
          display_name: 'Admin',
        });
        const app = buildTestApp(session);

        const res = await app.request('/api/copilot/v1/knowledge/upload-url', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            filename: 'test.pdf',
            mime_type: 'application/pdf',
            size_bytes: 1024,
          }),
        });

        expect(res.status).toBe(200);
        const body = (await res.json()) as {
          file_id: string;
          upload_url: string;
          s3_key: string;
        };
        expect(typeof body.file_id).toBe('string');
        expect(typeof body.upload_url).toBe('string');
        expect(typeof body.s3_key).toBe('string');
      } finally {
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    });
  });

  it('returns 403 when user is not org.admin', async () => {
    await withTestDb(dbEnv(), async ({ databaseUrl }) => {
      resetCoreDb();
      resetKnowledgeDb();
      initPools({ databaseUrl });
      try {
        const session = buildSession({
          tenant_id: crypto.randomUUID(),
          user_id: crypto.randomUUID(),
          email: 'member@example.test',
          display_name: 'Member',
          roles: ['org.member'],
        });
        const app = buildTestApp(session);
        const res = await app.request('/api/copilot/v1/knowledge/upload-url', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ filename: 'x.pdf', mime_type: 'application/pdf', size_bytes: 1 }),
        });
        expect(res.status).toBe(403);
      } finally {
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    });
  });
});

describe('POST /api/copilot/v1/knowledge/:id/processed', () => {
  it('returns 200 after flipping status to parsing', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetKnowledgeDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'processed-ok');
        const session = buildSession({
          tenant_id: tenantId,
          user_id: adminUserId,
          email: adminEmail,
          display_name: 'Admin',
        });

        // Insert a file row directly via requestKnowledgeUpload with a fake presign
        const uploaded = await requestKnowledgeUpload(
          {
            tenant_id: tenantId,
            uploaded_by: adminUserId,
            filename: 'doc.pdf',
            mime_type: 'application/pdf',
            size_bytes: 512,
          },
          {
            bucket: 'test-bucket',
            presign: async () => 'https://s3.example/presigned',
          },
        );

        const app = buildTestApp(session);
        const res = await app.request(`/api/copilot/v1/knowledge/${uploaded.file_id}/processed`, {
          method: 'POST',
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { ok: boolean };
        expect(body.ok).toBe(true);
      } finally {
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    });
  });
});

describe('GET /api/copilot/v1/knowledge', () => {
  it('returns files array for admin', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetKnowledgeDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'list-ok');
        const session = buildSession({
          tenant_id: tenantId,
          user_id: adminUserId,
          email: adminEmail,
          display_name: 'Admin',
        });

        await requestKnowledgeUpload(
          {
            tenant_id: tenantId,
            uploaded_by: adminUserId,
            filename: 'report.pdf',
            mime_type: 'application/pdf',
            size_bytes: 2048,
          },
          {
            bucket: 'test-bucket',
            presign: async () => 'https://s3.example/presigned',
          },
        );

        const app = buildTestApp(session);
        const res = await app.request('/api/copilot/v1/knowledge');
        expect(res.status).toBe(200);
        const body = (await res.json()) as { files: unknown[] };
        expect(Array.isArray(body.files)).toBe(true);
        expect(body.files.length).toBeGreaterThanOrEqual(1);
      } finally {
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    });
  });
});

describe('POST /api/copilot/v1/knowledge/:id/processed — bad id', () => {
  it('returns 400 when :id is not numeric', async () => {
    await withTestDb(dbEnv(), async ({ databaseUrl }) => {
      resetCoreDb();
      resetKnowledgeDb();
      initPools({ databaseUrl });
      try {
        const session = buildSession({
          tenant_id: crypto.randomUUID(),
          user_id: crypto.randomUUID(),
          email: 'admin@example.test',
          display_name: 'Admin',
        });
        const app = buildTestApp(session);
        const res = await app.request('/api/copilot/v1/knowledge/foo/processed', {
          method: 'POST',
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe('invalid_id');
      } finally {
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    });
  });
});

describe('DELETE /api/copilot/v1/knowledge/:id — bad id', () => {
  it('returns 400 when :id is not numeric', async () => {
    await withTestDb(dbEnv(), async ({ databaseUrl }) => {
      resetCoreDb();
      resetKnowledgeDb();
      initPools({ databaseUrl });
      try {
        const session = buildSession({
          tenant_id: crypto.randomUUID(),
          user_id: crypto.randomUUID(),
          email: 'admin@example.test',
          display_name: 'Admin',
        });
        const app = buildTestApp(session);
        const res = await app.request('/api/copilot/v1/knowledge/foo', { method: 'DELETE' });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe('invalid_id');
      } finally {
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    });
  });
});

describe('DELETE /api/copilot/v1/knowledge/:id', () => {
  it('returns 200 after deleting a file row', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetKnowledgeDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'delete-ok');
        const session = buildSession({
          tenant_id: tenantId,
          user_id: adminUserId,
          email: adminEmail,
          display_name: 'Admin',
        });

        const uploaded = await requestKnowledgeUpload(
          {
            tenant_id: tenantId,
            uploaded_by: adminUserId,
            filename: 'remove-me.pdf',
            mime_type: 'application/pdf',
            size_bytes: 100,
          },
          {
            bucket: 'test-bucket',
            presign: async () => 'https://s3.example/presigned',
          },
        );

        const app = buildTestApp(session);
        const res = await app.request(`/api/copilot/v1/knowledge/${uploaded.file_id}`, {
          method: 'DELETE',
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { ok: boolean };
        expect(body.ok).toBe(true);
      } finally {
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    });
  });

  it('returns 403 for non-admin', async () => {
    await withTestDb(dbEnv(), async ({ databaseUrl }) => {
      resetCoreDb();
      resetKnowledgeDb();
      initPools({ databaseUrl });
      try {
        const session = buildSession({
          tenant_id: crypto.randomUUID(),
          user_id: crypto.randomUUID(),
          email: 'member@example.test',
          display_name: 'Member',
          roles: ['org.member'],
        });
        const app = buildTestApp(session);
        const res = await app.request(`/api/copilot/v1/knowledge/42`, { method: 'DELETE' });
        expect(res.status).toBe(403);
      } finally {
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    });
  });
});
