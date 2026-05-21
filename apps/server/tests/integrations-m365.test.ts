import { hashRoleSummary, type SessionEnv, type SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { createUser } from '@seta/identity';
import { m365 } from '@seta/integrations';
import { createGroup } from '@seta/planner';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { handleServerError } from '../src/build.ts';
import { registerIntegrationsM365Routes } from '../src/routes/integrations-m365.ts';

function buildSession(opts: {
  tenant_id: string;
  user_id: string;
  roles?: string[];
}): SessionScope {
  const role_summary = {
    roles: opts.roles ?? ['org.admin'],
    cross_tenant_read: false,
  };
  return {
    session_id: crypto.randomUUID(),
    user_id: opts.user_id,
    tenant_id: opts.tenant_id,
    email: 'test@example.test',
    display_name: 'Test User',
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    accessible_group_ids: [],
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };
}

const MOCK_GROUPS = [
  { id: 'aaa-111', displayName: 'Engineering', mailNickname: 'engineering' },
  { id: 'bbb-222', displayName: 'Eng Leads', mailNickname: 'eng-leads' },
];

function buildTestApp(
  session: SessionScope,
  graphClientFor: (tenantId: string) => Promise<unknown>,
  extraDeps?: {
    workers?: {
      addJob: (id: string, payload?: unknown) => Promise<void>;
      shutdown?: () => Promise<void>;
    };
    m365LinksRepo?: m365.M365GroupLinkRepo;
  },
): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', session);
    await next();
  });
  const defaultWorkers = { addJob: async () => {}, shutdown: async () => {} };
  const defaultLinksRepo = {
    findByGroup: async () => null,
    findByExternal: async () => null,
    upsert: async () => undefined,
    tombstone: async () => undefined,
    setSyncStatus: async () => undefined,
  } as unknown as m365.M365GroupLinkRepo;
  registerIntegrationsM365Routes(app, {
    graphClientFor: graphClientFor as (
      tenantId: string,
    ) => Promise<import('@microsoft/microsoft-graph-client').Client>,
    workers: (extraDeps?.workers ?? defaultWorkers) as import('@seta/core/workers').WorkerHandle,
    m365LinksRepo: extraDeps?.m365LinksRepo ?? defaultLinksRepo,
  });
  app.onError(handleServerError);
  return app;
}

describe('GET /api/integrations/m365/groups/search', () => {
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();

  it('returns groups for org.admin with q >= 2 chars', async () => {
    const mockGraphClient = {
      api: () => ({
        header: () => ({
          search: () => ({
            select: () => ({
              top: () => ({
                get: async () => ({ value: MOCK_GROUPS }),
              }),
            }),
          }),
        }),
      }),
    };

    const session = buildSession({ tenant_id: tenantId, user_id: userId });
    const app = buildTestApp(session, async () => mockGraphClient as never);

    const res = await app.request('/api/integrations/m365/groups/search?q=Eng');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      groups: Array<{ external_id: string; display_name: string; mail_nickname: string }>;
    };
    expect(body.groups).toHaveLength(2);
    expect(body.groups[0]).toEqual({
      external_id: 'aaa-111',
      display_name: 'Engineering',
      mail_nickname: 'engineering',
    });
    expect(body.groups[1]).toEqual({
      external_id: 'bbb-222',
      display_name: 'Eng Leads',
      mail_nickname: 'eng-leads',
    });
  });

  it('returns empty groups when q is missing', async () => {
    const session = buildSession({ tenant_id: tenantId, user_id: userId });
    const app = buildTestApp(session, async () => {
      throw new Error('should not be called');
    });

    const res = await app.request('/api/integrations/m365/groups/search');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { groups: unknown[] };
    expect(body.groups).toHaveLength(0);
  });

  it('returns empty groups when q is 1 char', async () => {
    const session = buildSession({ tenant_id: tenantId, user_id: userId });
    const app = buildTestApp(session, async () => {
      throw new Error('should not be called');
    });

    const res = await app.request('/api/integrations/m365/groups/search?q=E');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { groups: unknown[] };
    expect(body.groups).toHaveLength(0);
  });

  it('returns 403 for non-admin user without planner.group.link.m365', async () => {
    const session = buildSession({
      tenant_id: tenantId,
      user_id: userId,
      roles: ['planner.contributor'],
    });
    const app = buildTestApp(session, async () => {
      throw new Error('should not be called');
    });

    const res = await app.request('/api/integrations/m365/groups/search?q=Eng');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('FORBIDDEN');
  });

  it('returns 400 with VALIDATION when graphClientFor throws M365NotConfiguredError', async () => {
    const session = buildSession({ tenant_id: tenantId, user_id: userId });
    const app = buildTestApp(session, async () => {
      throw new m365.M365NotConfiguredError('not configured');
    });

    const res = await app.request('/api/integrations/m365/groups/search?q=Eng');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('VALIDATION');
  });

  it('returns empty groups when q is stripped to less than 2 chars by sanitization', async () => {
    const session = buildSession({ tenant_id: tenantId, user_id: userId });
    const app = buildTestApp(session, async () => {
      throw new Error('should not be called');
    });

    const res = await app.request('/api/integrations/m365/groups/search?q=%22');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { groups: unknown[] };
    expect(body.groups).toHaveLength(0);
  });
});

const dbEnv = () => ({
  templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.SETA_TEST_PG_BASE as string,
});

async function seedTenant(pool: Pool, slug: string) {
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

describe('POST /api/integrations/m365/groups/:groupId/link', () => {
  it('returns 201 with group on happy path', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'm365-link-ok');
        const session = buildSession({ tenant_id: tenantId, user_id: adminUserId });
        const addJob = vi.fn().mockResolvedValue(undefined);

        const group = await createGroup({
          tenant_id: tenantId,
          name: 'Eng',
          session: {
            ...session,
            email: adminEmail,
            display_name: 'Admin',
            accessible_group_ids: [],
          },
        });

        const app = buildTestApp(
          session,
          async () => {
            throw new Error('unused');
          },
          {
            workers: { addJob, shutdown: async () => {} },
          },
        );

        const res = await app.request(`/api/integrations/m365/groups/${group.id}/link`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ external_id: 'ext-m365-aaa' }),
        });

        expect(res.status).toBe(201);
        const body = (await res.json()) as { external_source: string; external_id: string };
        expect(body.external_source).toBe('m365');
        expect(body.external_id).toBe('ext-m365-aaa');
        expect(addJob).toHaveBeenCalledWith('m365.group.pull', {
          tenant_id: tenantId,
          group_id: group.id,
          external_id: 'ext-m365-aaa',
          full: true,
        });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('returns 403 for non-admin without planner.group.link.m365', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'm365-link-rbac');
        const adminSession = {
          ...buildSession({ tenant_id: tenantId, user_id: adminUserId }),
          email: adminEmail,
          display_name: 'Admin',
          accessible_group_ids: [] as string[],
        };
        const group = await createGroup({
          tenant_id: tenantId,
          name: 'Eng',
          session: adminSession,
        });

        const nonAdminSession = buildSession({
          tenant_id: tenantId,
          user_id: crypto.randomUUID(),
          roles: ['planner.contributor'],
        });
        const app = buildTestApp(nonAdminSession, async () => {
          throw new Error('unused');
        });

        const res = await app.request(`/api/integrations/m365/groups/${group.id}/link`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ external_id: 'ext-m365-bbb' }),
        });

        expect(res.status).toBe(403);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe('FORBIDDEN');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('returns 400 with VALIDATION when external_id is missing or empty', async () => {
    const tenantId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const groupId = crypto.randomUUID();
    const session = buildSession({ tenant_id: tenantId, user_id: userId });
    const app = buildTestApp(session, async () => {
      throw new Error('unused');
    });

    const resMissing = await app.request(`/api/integrations/m365/groups/${groupId}/link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(resMissing.status).toBe(400);
    expect(((await resMissing.json()) as { error: string }).error).toBe('VALIDATION');

    const resEmpty = await app.request(`/api/integrations/m365/groups/${groupId}/link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ external_id: '   ' }),
    });
    expect(resEmpty.status).toBe(400);
    expect(((await resEmpty.json()) as { error: string }).error).toBe('VALIDATION');
  });
});

describe('POST /api/integrations/m365/groups/:groupId/unlink', () => {
  it('returns 200 with group unlinked on happy path', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'm365-unlink-ok');
        const session = buildSession({ tenant_id: tenantId, user_id: adminUserId });
        const fullSession = {
          ...session,
          email: adminEmail,
          display_name: 'Admin',
          accessible_group_ids: [] as string[],
        };

        const group = await createGroup({ tenant_id: tenantId, name: 'Eng', session: fullSession });

        const app = buildTestApp(session, async () => {
          throw new Error('unused');
        });

        // Link first via the route
        const linkRes = await app.request(`/api/integrations/m365/groups/${group.id}/link`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ external_id: 'ext-m365-ccc' }),
        });
        expect(linkRes.status).toBe(201);

        const unlinkRes = await app.request(`/api/integrations/m365/groups/${group.id}/unlink`, {
          method: 'POST',
        });

        expect(unlinkRes.status).toBe(200);
        const body = (await unlinkRes.json()) as {
          external_source: string;
          external_id: string | null;
        };
        expect(body.external_source).toBe('native');
        expect(body.external_id).toBeNull();
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('returns 403 for non-admin without planner.group.unlink', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'm365-unlink-rbac');
        const adminSession = {
          ...buildSession({ tenant_id: tenantId, user_id: adminUserId }),
          email: adminEmail,
          display_name: 'Admin',
          accessible_group_ids: [] as string[],
        };
        const group = await createGroup({
          tenant_id: tenantId,
          name: 'Eng',
          session: adminSession,
        });

        // Link via admin first
        const adminApp = buildTestApp(adminSession, async () => {
          throw new Error('unused');
        });
        const linkRes = await adminApp.request(`/api/integrations/m365/groups/${group.id}/link`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ external_id: 'ext-m365-ddd' }),
        });
        expect(linkRes.status).toBe(201);

        const nonAdminSession = buildSession({
          tenant_id: tenantId,
          user_id: crypto.randomUUID(),
          roles: ['planner.contributor'],
        });
        const app = buildTestApp(nonAdminSession, async () => {
          throw new Error('unused');
        });

        const res = await app.request(`/api/integrations/m365/groups/${group.id}/unlink`, {
          method: 'POST',
        });

        expect(res.status).toBe(403);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe('FORBIDDEN');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});

describe('POST /api/integrations/m365/groups/:groupId/refresh', () => {
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const groupId = crypto.randomUUID();

  it('returns 200 { ok: true } when group is linked', async () => {
    const mockLink = { tenantId, groupId, externalId: 'ext-refresh-aaa' };
    const addJob = vi.fn().mockResolvedValue(undefined);
    const session = buildSession({ tenant_id: tenantId, user_id: userId });
    const app = buildTestApp(
      session,
      async () => {
        throw new Error('unused');
      },
      {
        workers: { addJob, shutdown: async () => {} },
        m365LinksRepo: {
          findByGroup: vi.fn().mockResolvedValue(mockLink),
          findByExternal: vi.fn(),
          upsert: vi.fn(),
          tombstone: vi.fn(),
          setSyncStatus: vi.fn(),
        } as unknown as m365.M365GroupLinkRepo,
      },
    );

    const res = await app.request(`/api/integrations/m365/groups/${groupId}/refresh`, {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(addJob).toHaveBeenCalledWith('m365.group.pull', {
      tenant_id: tenantId,
      group_id: groupId,
      external_id: 'ext-refresh-aaa',
    });
  });

  it('returns 409 NOT_LINKED when no link exists', async () => {
    const session = buildSession({ tenant_id: tenantId, user_id: userId });
    const app = buildTestApp(
      session,
      async () => {
        throw new Error('unused');
      },
      {
        m365LinksRepo: {
          findByGroup: vi.fn().mockResolvedValue(null),
          findByExternal: vi.fn(),
          upsert: vi.fn(),
          tombstone: vi.fn(),
          setSyncStatus: vi.fn(),
        } as unknown as m365.M365GroupLinkRepo,
      },
    );

    const res = await app.request(`/api/integrations/m365/groups/${groupId}/refresh`, {
      method: 'POST',
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('NOT_LINKED');
  });

  it('returns 403 when the user does not have the group in accessible_group_ids', async () => {
    // Tests the group-scope gate in requirePermission: accessible_group_ids: [] means the
    // caller has no access to this group, regardless of which roles they hold.
    const session = buildSession({
      tenant_id: tenantId,
      user_id: userId,
      roles: ['planner.viewer'],
    });
    const app = buildTestApp(
      session,
      async () => {
        throw new Error('unused');
      },
      {
        m365LinksRepo: {
          findByGroup: vi.fn().mockResolvedValue({ tenantId, groupId, externalId: 'ext-x' }),
          findByExternal: vi.fn(),
          upsert: vi.fn(),
          tombstone: vi.fn(),
          setSyncStatus: vi.fn(),
        } as unknown as m365.M365GroupLinkRepo,
      },
    );

    const res = await app.request(`/api/integrations/m365/groups/${groupId}/refresh`, {
      method: 'POST',
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('FORBIDDEN');
  });
});

describe('POST /api/integrations/m365/groups/:groupId/resolve', () => {
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const groupId = crypto.randomUUID();
  const linkId = crypto.randomUUID();

  function buildResolveLinksRepo(
    overrides?: Partial<m365.M365GroupLinkRepo>,
  ): m365.M365GroupLinkRepo {
    return {
      findByGroup: vi.fn().mockResolvedValue({
        id: linkId,
        tenantId,
        groupId,
        externalId: 'ext-resolve-aaa',
        lastSyncedFields: {},
        deltaLink: null,
        syncStatus: 'conflict',
        lastError: null,
        lastSyncedAt: new Date(),
        unlinkedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      findByExternal: vi.fn(),
      upsert: vi.fn(),
      setSyncStatus: vi.fn().mockResolvedValue(undefined),
      persistDeltaLink: vi.fn(),
      tombstone: vi.fn(),
      ...overrides,
    } as unknown as m365.M365GroupLinkRepo;
  }

  it('returns 400 VALIDATION when decisions array is empty', async () => {
    const session = buildSession({ tenant_id: tenantId, user_id: userId });
    const app = buildTestApp(session, async () => {
      throw new Error('unused');
    });

    const res = await app.request(`/api/integrations/m365/groups/${groupId}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decisions: [] }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('VALIDATION');
  });

  it('returns 404 NOT_FOUND when group has no link', async () => {
    const session = buildSession({ tenant_id: tenantId, user_id: userId });
    const app = buildTestApp(
      session,
      async () => {
        throw new Error('unused');
      },
      {
        m365LinksRepo: buildResolveLinksRepo({
          findByGroup: vi.fn().mockResolvedValue(null),
        }),
      },
    );

    const res = await app.request(`/api/integrations/m365/groups/${groupId}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decisions: [{ field: 'name', choice: 'local' }] }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('NOT_FOUND');
  });

  it('returns 403 for planner.contributor without resolve permission', async () => {
    const session = buildSession({
      tenant_id: tenantId,
      user_id: userId,
      roles: ['planner.contributor'],
    });
    const app = buildTestApp(
      session,
      async () => {
        throw new Error('unused');
      },
      { m365LinksRepo: buildResolveLinksRepo() },
    );

    const res = await app.request(`/api/integrations/m365/groups/${groupId}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decisions: [{ field: 'name', choice: 'local' }] }),
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('FORBIDDEN');
  });

  it('returns 200 { ok: true } on happy path with remote choice', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const {
          tenantId: tid,
          adminUserId,
          adminEmail,
        } = await seedTenant(pool, 'm365-resolve-remote');
        const adminSession = {
          ...buildSession({ tenant_id: tid, user_id: adminUserId }),
          email: adminEmail,
          display_name: 'Admin',
          accessible_group_ids: [] as string[],
        };
        const group = await createGroup({
          tenant_id: tid,
          name: 'Original',
          session: adminSession,
        });

        const resolveLinksRepo = buildResolveLinksRepo({
          findByGroup: vi.fn().mockResolvedValue({
            id: linkId,
            tenantId: tid,
            groupId: group.id,
            externalId: 'ext-resolve-remote',
            lastSyncedFields: { name: 'Remote Name' },
            deltaLink: null,
            syncStatus: 'conflict',
            lastError: null,
            lastSyncedAt: new Date(),
            unlinkedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        });

        const app = buildTestApp(
          adminSession,
          async () => {
            throw new Error('unused');
          },
          { m365LinksRepo: resolveLinksRepo },
        );

        const res = await app.request(`/api/integrations/m365/groups/${group.id}/resolve`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ decisions: [{ field: 'name', choice: 'remote' }] }),
        });

        expect(res.status).toBe(200);
        const body = (await res.json()) as { ok: boolean };
        expect(body.ok).toBe(true);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('returns 200 { ok: true } on happy path with local choice', async () => {
    const addJob = vi.fn().mockResolvedValue(undefined);
    const session = buildSession({ tenant_id: tenantId, user_id: userId });
    const app = buildTestApp(
      session,
      async () => {
        throw new Error('unused');
      },
      {
        workers: { addJob, shutdown: async () => {} } as import('@seta/core/workers').WorkerHandle,
        m365LinksRepo: buildResolveLinksRepo(),
      },
    );

    const res = await app.request(`/api/integrations/m365/groups/${groupId}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decisions: [{ field: 'name', choice: 'local' }] }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(addJob).toHaveBeenCalledWith('m365.group.push', {
      tenant_id: tenantId,
      group_id: groupId,
      changed_fields: ['name'],
    });
  });
});

describe('GET /api/integrations/m365/groups/:groupId/sync-status', () => {
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const groupId = crypto.randomUUID();

  it('returns { sync_status: null } when not linked', async () => {
    const session = buildSession({ tenant_id: tenantId, user_id: userId });
    const app = buildTestApp(
      session,
      async () => {
        throw new Error('unused');
      },
      {
        m365LinksRepo: {
          findByGroup: vi.fn().mockResolvedValue(null),
          findByExternal: vi.fn(),
          upsert: vi.fn(),
          tombstone: vi.fn(),
          setSyncStatus: vi.fn(),
          persistDeltaLink: vi.fn(),
        } as unknown as m365.M365GroupLinkRepo,
      },
    );

    const res = await app.request(`/api/integrations/m365/groups/${groupId}/sync-status`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sync_status: null };
    expect(body.sync_status).toBeNull();
  });

  it('returns current sync status when linked', async () => {
    const syncedAt = new Date('2024-01-15T10:00:00Z');
    const session = buildSession({ tenant_id: tenantId, user_id: userId });
    const app = buildTestApp(
      session,
      async () => {
        throw new Error('unused');
      },
      {
        m365LinksRepo: {
          findByGroup: vi.fn().mockResolvedValue({
            id: crypto.randomUUID(),
            tenantId,
            groupId,
            externalId: 'ext-aaa',
            lastSyncedFields: {},
            deltaLink: null,
            syncStatus: 'idle',
            lastError: null,
            lastSyncedAt: syncedAt,
            unlinkedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
          findByExternal: vi.fn(),
          upsert: vi.fn(),
          tombstone: vi.fn(),
          setSyncStatus: vi.fn(),
          persistDeltaLink: vi.fn(),
        } as unknown as m365.M365GroupLinkRepo,
      },
    );

    const res = await app.request(`/api/integrations/m365/groups/${groupId}/sync-status`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sync_status: string; synced_at: string; last_error: null };
    expect(body.sync_status).toBe('idle');
    expect(body.synced_at).toBe(syncedAt.toISOString());
    expect(body.last_error).toBeNull();
  });

  it('returns 403 when user does not have access to the group', async () => {
    const session = buildSession({
      tenant_id: tenantId,
      user_id: userId,
      roles: ['planner.contributor'],
    });
    const app = buildTestApp(
      session,
      async () => {
        throw new Error('unused');
      },
      {
        m365LinksRepo: {
          findByGroup: vi.fn().mockResolvedValue(null),
          findByExternal: vi.fn(),
          upsert: vi.fn(),
          tombstone: vi.fn(),
          setSyncStatus: vi.fn(),
          persistDeltaLink: vi.fn(),
        } as unknown as m365.M365GroupLinkRepo,
      },
    );

    const res = await app.request(`/api/integrations/m365/groups/${groupId}/sync-status`);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('FORBIDDEN');
  });
});

describe('GET /api/integrations/m365/groups/:groupId/sync-status/stream', () => {
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const groupId = crypto.randomUUID();

  it('returns 403 when user does not have group access', async () => {
    const session = buildSession({
      tenant_id: tenantId,
      user_id: userId,
      roles: ['planner.contributor'],
    });
    const app = buildTestApp(
      session,
      async () => {
        throw new Error('unused');
      },
      {
        m365LinksRepo: {
          findByGroup: vi.fn().mockResolvedValue(null),
          findByExternal: vi.fn(),
          upsert: vi.fn(),
          tombstone: vi.fn(),
          setSyncStatus: vi.fn(),
          persistDeltaLink: vi.fn(),
        } as unknown as m365.M365GroupLinkRepo,
      },
    );

    const res = await app.request(`/api/integrations/m365/groups/${groupId}/sync-status/stream`);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('FORBIDDEN');
  });

  it('connects and sends initial sync-status event with SSE headers', async () => {
    const syncedAt = new Date('2024-03-01T08:00:00Z');
    const session = buildSession({ tenant_id: tenantId, user_id: userId });
    const findByGroup = vi.fn().mockResolvedValue({
      id: crypto.randomUUID(),
      tenantId,
      groupId,
      externalId: 'ext-stream-aaa',
      lastSyncedFields: {},
      deltaLink: null,
      syncStatus: 'pulling',
      lastError: null,
      lastSyncedAt: syncedAt,
      unlinkedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const app = buildTestApp(
      session,
      async () => {
        throw new Error('unused');
      },
      {
        m365LinksRepo: {
          findByGroup,
          findByExternal: vi.fn(),
          upsert: vi.fn(),
          tombstone: vi.fn(),
          setSyncStatus: vi.fn(),
          persistDeltaLink: vi.fn(),
        } as unknown as m365.M365GroupLinkRepo,
      },
    );

    const ac = new AbortController();
    const res = await app.request(`/api/integrations/m365/groups/${groupId}/sync-status/stream`, {
      signal: ac.signal,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    // Read the initial SSE chunk
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let received = '';
    while (!received.includes('event: sync-status')) {
      const { value, done } = await reader.read();
      if (done) break;
      received += decoder.decode(value);
    }
    ac.abort();

    expect(received).toContain('event: sync-status');
    expect(received).toContain('"sync_status":"pulling"');
  });
});
