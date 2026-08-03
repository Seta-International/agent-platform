import { hashRoleSummary, type SessionEnv, type SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import {
  buildRegistry,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
  resolvePermissions,
} from '@seta/shared-rbac';
import type { Context } from 'hono';
import { Hono } from 'hono';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { m365DirectoryConflict } from '../../src/backend/db/schema/index.ts';
import { registerM365DirectoryRoutes } from '../../src/backend/http/directory-routes.ts';
import { createPeopleResolutionSurface } from '../../src/backend/m365/directory/people-surface.ts';
import { createDirectoryRepo } from '../../src/backend/m365/directory/repo.ts';
import { createDirectoryRunReader } from '../../src/backend/m365/directory/status.ts';
import { integrationsErrorMapper } from '../../src/register.ts';
import { withIntegrationsTestDb } from '../helpers/test-db.ts';
import { seedTenantConfig, TENANT } from './_directory-sync-helpers.ts';

const ADMIN = '55555555-5555-4555-8555-555555555551';
const VIEWER = '55555555-5555-4555-8555-555555555552';
const NOBODY = '55555555-5555-4555-8555-555555555553';
const OTHER_TENANT = '66666666-6666-4666-8666-666666666666';
const UNIT = '77777777-7777-4777-8777-777777777771';

const registry = buildRegistry(inventoryToManifests(INVENTORY));
function permsFor(roles: string[]): ReadonlySet<string> {
  return resolvePermissions(registry, roles, IMPLICIT_PERMISSIONS);
}

function session(opts: { user_id: string; tenant_id?: string; roles: string[] }): SessionScope {
  const role_summary = { roles: opts.roles, cross_tenant_read: false, assignments: [] };
  return {
    session_id: crypto.randomUUID(),
    user_id: opts.user_id,
    tenant_id: opts.tenant_id ?? TENANT,
    email: `${opts.user_id}@example.test`,
    display_name: 'Admin',
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    permissions: permsFor(opts.roles),
    assignments: [],
    group_ids: [],
    product_access: new Set<string>(),
    person_id: null,
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };
}

function errorHandler(err: Error, c: Context) {
  const mapped = integrationsErrorMapper(err);
  if (mapped) return c.json(mapped.body as never, mapped.status as never);
  throw err;
}

interface Harness {
  app: Hono<SessionEnv>;
  addJob: ReturnType<typeof vi.fn>;
}

function appFor(scope: SessionScope, db: Parameters<typeof createDirectoryRepo>[0]['db']): Harness {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', scope);
    await next();
  });
  const addJob = vi.fn().mockResolvedValue(undefined);
  registerM365DirectoryRoutes(app, {
    repo: createDirectoryRepo({ db }),
    // The REAL @seta/people adapter, not a double: the resolve route must reach the same public
    // functions the sync uses, under the admin's session (§9.2).
    people: createPeopleResolutionSurface(),
    workers: { addJob, shutdown: vi.fn() },
    lastRun: createDirectoryRunReader(db),
  });
  app.onError(errorHandler);
  return { app, addJob };
}

async function seedConflict(
  db: Parameters<typeof createDirectoryRepo>[0]['db'],
  over: { tenantId?: string; status?: 'open' | 'resolved' } = {},
): Promise<string> {
  const [row] = await db
    .insert(m365DirectoryConflict)
    .values({
      tenantId: over.tenantId ?? TENANT,
      kind: 'manager_ambiguous',
      subjectType: 'org_unit',
      subjectId: UNIT,
      detail: { candidates: [{ person_id: ADMIN, full_name: 'A', report_count: 2 }] },
      status: over.status ?? 'open',
    })
    .returning({ id: m365DirectoryConflict.id });
  return row?.id as string;
}

async function seedSyncedEvent(pool: Pool): Promise<void> {
  await pool.query(
    `INSERT INTO core.events
       (id, tenant_id, aggregate_type, aggregate_id, event_type, event_version, payload)
     VALUES (gen_random_uuid(), $1::uuid, 'integrations.m365.directory', $1::text,
             'integrations.m365.directory.synced', 1, $2::jsonb)`,
    [
      TENANT,
      JSON.stringify({
        tenant_id: TENANT,
        full: true,
        users_seen: 12,
        users_filtered: 2,
        users_created: 3,
        users_updated: 1,
        users_unchanged: 6,
        users_collided: 0,
        users_removed: 0,
        org_units_created: 4,
        org_units_renamed: 1,
        heads_set: 2,
        manager_ambiguous: 1,
        photos_stored: 5,
        photos_missing: 7,
        mailbox_forbidden: 0,
      }),
    ],
  );
}

describe('m365 directory routes (design §9.2)', () => {
  it('GET /conflicts is gated on integrations.m365.read and scoped to the caller tenant', async () => {
    await withIntegrationsTestDb(async ({ db, pool }) => {
      resetCoreDb();
      await seedTenantConfig(db, pool);
      const openId = await seedConflict(db);
      await seedConflict(db, { status: 'resolved' });
      await seedConflict(db, { tenantId: OTHER_TENANT });

      const denied = await appFor(session({ user_id: NOBODY, roles: [] }), db).app.request(
        '/api/integrations/m365/directory/conflicts',
      );
      expect(denied.status).toBe(403);
      expect(await denied.json()).toMatchObject({ error: 'FORBIDDEN' });

      const res = await appFor(
        session({ user_id: VIEWER, roles: ['integrations.viewer'] }),
        db,
      ).app.request('/api/integrations/m365/directory/conflicts?status=open');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { conflicts: Array<{ id: string; kind: string }> };
      expect(body.conflicts).toHaveLength(1);
      expect(body.conflicts[0]).toMatchObject({
        id: openId,
        kind: 'manager_ambiguous',
        subject_type: 'org_unit',
        subject_id: UNIT,
        status: 'open',
      });
    });
  });

  it('GET /conflicts defaults to open and rejects an unknown status', async () => {
    await withIntegrationsTestDb(async ({ db, pool }) => {
      resetCoreDb();
      await seedTenantConfig(db, pool);
      await seedConflict(db, { status: 'resolved' });

      const { app } = appFor(session({ user_id: VIEWER, roles: ['integrations.viewer'] }), db);

      const defaulted = await app.request('/api/integrations/m365/directory/conflicts');
      expect(defaulted.status).toBe(200);
      expect((await defaulted.json()).conflicts).toHaveLength(0);

      const resolved = await app.request(
        '/api/integrations/m365/directory/conflicts?status=resolved',
      );
      expect((await resolved.json()).conflicts).toHaveLength(1);

      const bad = await app.request('/api/integrations/m365/directory/conflicts?status=banana');
      expect(bad.status).toBe(400);
    });
  });

  it('POST /conflicts/:id/resolve needs configure, and attributes the decision to the admin', async () => {
    await withIntegrationsTestDb(async ({ db, pool }) => {
      resetCoreDb();
      await seedTenantConfig(db, pool);
      const conflictId = await seedConflict(db);

      const viewer = await appFor(
        session({ user_id: VIEWER, roles: ['integrations.viewer'] }),
        db,
      ).app.request(`/api/integrations/m365/directory/conflicts/${conflictId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ action: 'ignore' }),
        headers: { 'content-type': 'application/json' },
      });
      expect(viewer.status).toBe(403);

      const res = await appFor(
        session({ user_id: ADMIN, roles: ['integrations.admin'] }),
        db,
      ).app.request(`/api/integrations/m365/directory/conflicts/${conflictId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ action: 'ignore' }),
        headers: { 'content-type': 'application/json' },
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ resolved: true });

      const { rows } = await pool.query<{ status: string; resolved_by: string }>(
        'SELECT status, resolved_by FROM integrations.m365_directory_conflict WHERE id = $1',
        [conflictId],
      );
      // Not the system actor: §9.2 requires a real person in the audit trail.
      expect(rows[0]).toMatchObject({ status: 'ignored', resolved_by: ADMIN });
    });
  });

  it('POST /conflicts/:id/resolve rejects an action the kind does not offer, and a missing row', async () => {
    await withIntegrationsTestDb(async ({ db, pool }) => {
      resetCoreDb();
      await seedTenantConfig(db, pool);
      const conflictId = await seedConflict(db);
      const { app } = appFor(session({ user_id: ADMIN, roles: ['integrations.admin'] }), db);

      const illegal = await app.request(
        `/api/integrations/m365/directory/conflicts/${conflictId}/resolve`,
        {
          method: 'POST',
          body: JSON.stringify({ action: 'offboard' }),
          headers: { 'content-type': 'application/json' },
        },
      );
      expect(illegal.status).toBe(400);

      const noAction = await app.request(
        `/api/integrations/m365/directory/conflicts/${conflictId}/resolve`,
        {
          method: 'POST',
          body: JSON.stringify({}),
          headers: { 'content-type': 'application/json' },
        },
      );
      expect(noAction.status).toBe(400);

      const missing = await app.request(
        `/api/integrations/m365/directory/conflicts/${crypto.randomUUID()}/resolve`,
        {
          method: 'POST',
          body: JSON.stringify({ action: 'ignore' }),
          headers: { 'content-type': 'application/json' },
        },
      );
      expect(missing.status).toBe(404);
    });
  });

  it('POST /sync needs configure and enqueues a full run under the per-tenant jobKey', async () => {
    await withIntegrationsTestDb(async ({ db, pool }) => {
      resetCoreDb();
      await seedTenantConfig(db, pool);

      const viewer = appFor(session({ user_id: VIEWER, roles: ['integrations.viewer'] }), db);
      const denied = await viewer.app.request('/api/integrations/m365/directory/sync', {
        method: 'POST',
      });
      expect(denied.status).toBe(403);
      expect(viewer.addJob).not.toHaveBeenCalled();

      const admin = appFor(session({ user_id: ADMIN, roles: ['integrations.admin'] }), db);
      const res = await admin.app.request('/api/integrations/m365/directory/sync', {
        method: 'POST',
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ enqueued: true, full: true });
      // Never run inline: the route hands the work to the same job the cron fans out (§10).
      expect(admin.addJob).toHaveBeenCalledWith(
        'm365.directory.pull',
        { tenant_id: TENANT, full: true },
        { jobKey: `m365.directory.pull:${TENANT}` },
      );
    });
  });

  it('GET /status reports the last run, its §11 counters and the open-conflict count', async () => {
    await withIntegrationsTestDb(async ({ db, pool }) => {
      resetCoreDb();
      await seedTenantConfig(db, pool);
      await seedConflict(db);
      await seedSyncedEvent(pool);
      await pool.query(
        `UPDATE integrations.m365_tenant_config
            SET directory_delta_link = 'https://graph.microsoft.com/v1.0/users/delta?$deltatoken=T',
                directory_synced_at = now(),
                directory_last_status = 'error',
                directory_last_error = 'graph 429'
          WHERE tenant_id = $1`,
        [TENANT],
      );

      const denied = await appFor(session({ user_id: NOBODY, roles: [] }), db).app.request(
        '/api/integrations/m365/directory/status',
      );
      expect(denied.status).toBe(403);

      const res = await appFor(
        session({ user_id: VIEWER, roles: ['integrations.viewer'] }),
        db,
      ).app.request('/api/integrations/m365/directory/status');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        configured: true,
        last_status: 'error',
        last_error: 'graph 429',
        cursor_present: true,
        open_conflicts: 1,
        last_run: {
          full: true,
          counters: { users_seen: 12, users_created: 3, org_units_created: 4, photos_missing: 7 },
        },
      });
      expect(typeof body.last_synced_at).toBe('string');
      // The delta link is a Graph continuation token — reported as present, never handed out.
      expect(JSON.stringify(body)).not.toContain('deltatoken');
    });
  });

  it('GET /status on a tenant with no M365 config reports unconfigured rather than failing', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      resetCoreDb();
      const res = await appFor(
        session({ user_id: VIEWER, tenant_id: OTHER_TENANT, roles: ['integrations.viewer'] }),
        db,
      ).app.request('/api/integrations/m365/directory/status');
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        configured: false,
        last_status: null,
        last_run: null,
        open_conflicts: 0,
      });
    });
  });
});
