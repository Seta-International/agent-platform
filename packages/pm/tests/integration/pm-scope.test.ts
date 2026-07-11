// packages/pm/tests/integration/pm-scope.test.ts
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { tenantScoped } from '@seta/shared-rbac';
import { withTestDb } from '@seta/shared-testing';
import { and, isNull } from 'drizzle-orm';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { pmDb, resetPmDb } from '../../src/backend/db/client.ts';
import { account, allocation, project, projectAccess } from '../../src/backend/db/schema.ts';
import { buildAccountScope, buildProjectScope } from '../../src/backend/domain/scope.ts';
import { listAllocations, listProjectAllocations } from '../../src/index.ts';
import { buildSession, type SeededTenant, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

interface Graph {
  t: SeededTenant;
  u1: string;
  u2: string;
  W_lead: string;
  W_am: string;
  A1: string; // AM = W_am
  A2: string; // unmanaged
  P1: string; // org=u1, lead=W_lead, account=A2
  P2: string; // org=u2, account=A2
  P3: string; // no org, account=A1 (W_am's account)
  alloc1: string;
  alloc2: string;
  alloc3: string;
}

/**
 * Deliberate visibility graph in one tenant:
 *  - A1 is managed by W_am; A2 has no AM.
 *  - P1: org_unit=u1, led by W_lead, on account A2.
 *  - P2: org_unit=u2, no lead, on account A2.
 *  - P3: no org_unit, on account A1 (W_am's account).
 *  - One allocation per project.
 */
async function buildGraph(pool: Pool): Promise<Graph> {
  const t = await seedTenant(pool);
  const u1 = crypto.randomUUID();
  const u2 = crypto.randomUUID();
  const W_lead = crypto.randomUUID();
  const W_am = crypto.randomUUID();

  const [a1] = await pmDb()
    .insert(account)
    .values({ tenant_id: t.tenant_id, name: 'A1 (AM-managed)', am_person_id: W_am })
    .returning({ id: account.id });
  const [a2] = await pmDb()
    .insert(account)
    .values({ tenant_id: t.tenant_id, name: 'A2 (unmanaged)', am_person_id: null })
    .returning({ id: account.id });
  const A1 = a1!.id;
  const A2 = a2!.id;

  const [p1] = await pmDb()
    .insert(project)
    .values({
      tenant_id: t.tenant_id,
      account_id: A2,
      name: 'P1',
      org_unit_id: u1,
      pm_worker_id: W_lead,
    })
    .returning({ id: project.id });
  const [p2] = await pmDb()
    .insert(project)
    .values({ tenant_id: t.tenant_id, account_id: A2, name: 'P2', org_unit_id: u2 })
    .returning({ id: project.id });
  const [p3] = await pmDb()
    .insert(project)
    .values({ tenant_id: t.tenant_id, account_id: A1, name: 'P3' })
    .returning({ id: project.id });
  const P1 = p1!.id;
  const P2 = p2!.id;
  const P3 = p3!.id;

  const mkAlloc = async (project_id: string): Promise<string> => {
    const [row] = await pmDb()
      .insert(allocation)
      .values({
        tenant_id: t.tenant_id,
        project_id,
        worker_id: crypto.randomUUID(),
        date_from: '2026-01-01',
        status: 'committed',
      })
      .returning({ id: allocation.id });
    return row!.id;
  };
  const alloc1 = await mkAlloc(P1);
  const alloc2 = await mkAlloc(P2);
  const alloc3 = await mkAlloc(P3);

  return { t, u1, u2, W_lead, W_am, A1, A2, P1, P2, P3, alloc1, alloc2, alloc3 };
}

async function visibleProjects(session: ReturnType<typeof buildSession>): Promise<Set<string>> {
  const predicate = buildProjectScope(session);
  const base = and(tenantScoped(project.tenant_id, session), isNull(project.deleted_at));
  const where = predicate ? and(base, predicate) : base;
  const rows = await pmDb().select({ id: project.id }).from(project).where(where);
  return new Set(rows.map((r) => r.id));
}

function tenantViewer(t: SeededTenant): ReturnType<typeof buildSession> {
  return buildSession({
    tenant_id: t.tenant_id,
    user_id: crypto.randomUUID(),
    roles: ['pm.viewer'],
    assignments: [{ role_slug: 'pm.viewer', scope_kind: 'tenant', scope_id: null }],
  });
}

function orgManager(t: SeededTenant, orgUnitId: string): ReturnType<typeof buildSession> {
  return buildSession({
    tenant_id: t.tenant_id,
    user_id: crypto.randomUUID(),
    roles: ['pm.manager'],
    assignments: [
      {
        role_slug: 'pm.manager',
        scope_kind: 'org_unit',
        scope_id: orgUnitId,
        org_unit_ids: [orgUnitId],
      },
    ],
  });
}

function relationshipViewer(t: SeededTenant, workerId: string): ReturnType<typeof buildSession> {
  return buildSession({
    tenant_id: t.tenant_id,
    user_id: crypto.randomUUID(),
    roles: ['pm.viewer'],
    assignments: [{ role_slug: 'pm.viewer', scope_kind: 'self', scope_id: null }],
    worker_id: workerId,
  });
}

function noLinkViewer(t: SeededTenant): ReturnType<typeof buildSession> {
  return buildSession({
    tenant_id: t.tenant_id,
    user_id: crypto.randomUUID(),
    roles: ['pm.viewer'],
    assignments: [],
  });
}

describe('pm scope builders (D-1)', () => {
  it('tenant-scoped pm.viewer sees all projects', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const g = await buildGraph(pool);
        const session = tenantViewer(g.t);
        expect(buildProjectScope(session)).toBeNull();
        const seen = await visibleProjects(session);
        expect(seen).toEqual(new Set([g.P1, g.P2, g.P3]));
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('org_unit-scoped manager sees only the subtree projects', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const g = await buildGraph(pool);
        const session = orgManager(g.t, g.u1);
        const seen = await visibleProjects(session);
        expect(seen).toEqual(new Set([g.P1]));
        expect(seen.has(g.P2)).toBe(false);
        expect(seen.has(g.P3)).toBe(false);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('lead sees own project regardless of org scope', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const g = await buildGraph(pool);
        const session = relationshipViewer(g.t, g.W_lead);
        const seen = await visibleProjects(session);
        expect(seen).toEqual(new Set([g.P1]));
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('AM sees projects on managed accounts', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const g = await buildGraph(pool);
        const session = relationshipViewer(g.t, g.W_am);
        const seen = await visibleProjects(session);
        expect(seen).toEqual(new Set([g.P3]));
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('scoped viewer with no worker link and no org reach sees none', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const g = await buildGraph(pool);
        const session = noLinkViewer(g.t);
        const seen = await visibleProjects(session);
        expect(seen).toEqual(new Set());
        // Account scope must also fail-closed the same way.
        expect(
          await pmDb()
            .select({ id: account.id })
            .from(account)
            .where(
              and(
                tenantScoped(account.tenant_id, session),
                buildAccountScope(session) ?? undefined,
              ),
            ),
        ).toEqual([]);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('listAllocations D-1: org-scoped manager gets only subtree allocations', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const g = await buildGraph(pool);
        const session = orgManager(g.t, g.u1);
        const rows = await listAllocations({ session });
        expect(rows.map((r) => r.allocation_id)).toEqual([g.alloc1]);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('listProjectAllocations 404s on invisible project', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const g = await buildGraph(pool);
        const session = orgManager(g.t, g.u1);
        await expect(listProjectAllocations({ project_id: g.P2, session })).rejects.toMatchObject({
          code: 'NOT_FOUND',
        });
        // Visible project still works.
        const rows = await listProjectAllocations({ project_id: g.P1, session });
        expect(rows.map((r) => r.allocation_id)).toEqual([g.alloc1]);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('cross-tenant rows never leak through arms', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const g = await buildGraph(pool);
        const t2 = await seedTenant(pool);
        // Tenant B: lookalike rows reusing tenant A's org_unit id and W_lead worker id.
        const [a2b] = await pmDb()
          .insert(account)
          .values({ tenant_id: t2.tenant_id, name: 'B-Acct', am_person_id: g.W_am })
          .returning({ id: account.id });
        await pmDb().insert(project).values({
          tenant_id: t2.tenant_id,
          account_id: a2b!.id,
          name: 'B-Project',
          org_unit_id: g.u1,
          pm_worker_id: g.W_lead,
        });

        const orgSession = orgManager(g.t, g.u1);
        const orgSeen = await visibleProjects(orgSession);
        expect(orgSeen).toEqual(new Set([g.P1]));

        const leadSession = relationshipViewer(g.t, g.W_lead);
        const leadSeen = await visibleProjects(leadSession);
        expect(leadSeen).toEqual(new Set([g.P1]));

        const amSession = relationshipViewer(g.t, g.W_am);
        const amSeen = await visibleProjects(amSession);
        expect(amSeen).toEqual(new Set([g.P3]));
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});

describe('project_access owners (FUT-353)', () => {
  it('access-level owner sees the project, its allocations, and its account', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const g = await buildGraph(pool);
        const W_owner = crypto.randomUUID();
        await pmDb().insert(projectAccess).values({
          tenant_id: g.t.tenant_id,
          project_id: g.P2,
          worker_id: W_owner,
          level: 'owner',
        });

        const session = relationshipViewer(g.t, W_owner);
        expect(await visibleProjects(session)).toEqual(new Set([g.P2]));

        const rows = await listAllocations({ session });
        expect(rows.map((r) => r.allocation_id)).toEqual([g.alloc2]);

        const accounts = await pmDb()
          .select({ id: account.id })
          .from(account)
          .where(
            and(tenantScoped(account.tenant_id, session), buildAccountScope(session) ?? undefined),
          );
        expect(accounts.map((a) => a.id)).toEqual([g.A2]);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('edit/view access levels do not grant visibility', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const g = await buildGraph(pool);
        const W_editor = crypto.randomUUID();
        await pmDb()
          .insert(projectAccess)
          .values([
            { tenant_id: g.t.tenant_id, project_id: g.P2, worker_id: W_editor, level: 'edit' },
            { tenant_id: g.t.tenant_id, project_id: g.P3, worker_id: W_editor, level: 'view' },
          ]);

        const session = relationshipViewer(g.t, W_editor);
        expect(await visibleProjects(session)).toEqual(new Set());
        expect(await listAllocations({ session })).toEqual([]);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
