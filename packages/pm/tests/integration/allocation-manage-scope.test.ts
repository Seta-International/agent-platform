// FUT-353: allocation mutations must be row-scoped to projects the caller manages —
// `pm.project.manage` alone must not let a self-scoped EM/TL mutate other projects.
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { pmDb, resetPmDb } from '../../src/backend/db/client.ts';
import { account, allocation, project, projectAccess } from '../../src/backend/db/schema.ts';
import { createAllocation, removeAllocation, updateAllocation } from '../../src/index.ts';
import { buildSession, type SeededTenant, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

interface Graph {
  t: SeededTenant;
  W_em: string;
  P_own: string; // W_em owns via project_access level 'owner'
  P_other: string;
  allocOwn: string;
  allocOther: string;
}

async function buildGraph(pool: Pool): Promise<Graph> {
  const t = await seedTenant(pool);
  const W_em = crypto.randomUUID();

  const [acc] = await pmDb()
    .insert(account)
    .values({ tenant_id: t.tenant_id, name: 'Acct', am_worker_id: null })
    .returning({ id: account.id });
  const mkProject = async (name: string): Promise<string> => {
    const [row] = await pmDb()
      .insert(project)
      .values({ tenant_id: t.tenant_id, account_id: acc!.id, name })
      .returning({ id: project.id });
    return row!.id;
  };
  const P_own = await mkProject('P_own');
  const P_other = await mkProject('P_other');
  await pmDb().insert(projectAccess).values({
    tenant_id: t.tenant_id,
    project_id: P_own,
    worker_id: W_em,
    level: 'owner',
  });

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
  const allocOwn = await mkAlloc(P_own);
  const allocOther = await mkAlloc(P_other);

  return { t, W_em, P_own, P_other, allocOwn, allocOther };
}

/** EM/TL persona: tenant-wide read (rows visible in RA Monitoring), self-scoped manage. */
function emSession(t: SeededTenant, workerId: string): ReturnType<typeof buildSession> {
  return buildSession({
    tenant_id: t.tenant_id,
    user_id: crypto.randomUUID(),
    roles: ['pm.manager'],
    assignments: [
      { role_slug: 'pm.viewer', scope_kind: 'tenant', scope_id: null },
      { role_slug: 'pm.manager', scope_kind: 'self', scope_id: null },
    ],
    worker_id: workerId,
  });
}

function run(fn: (g: Graph) => Promise<void>): Promise<void> {
  return withTestDb(ctx, async ({ pool, databaseUrl }) => {
    resetCoreDb();
    resetPmDb();
    initPools({ databaseUrl });
    try {
      await fn(await buildGraph(pool));
    } finally {
      resetPmDb();
      resetCoreDb();
      await closePools();
    }
  });
}

const newAlloc = (project_id: string) => ({
  project_id,
  status: 'placeholder' as const,
  bucket: 'billable' as const,
});

describe('allocation manage scope (FUT-353)', () => {
  it('access-owner EM can create/update/remove allocations on their own project', () =>
    run(async (g) => {
      const session = emSession(g.t, g.W_em);
      const created = await createAllocation({ ...newAlloc(g.P_own), session });
      expect(created.allocation_id).toBeTruthy();
      const updated = await updateAllocation({
        allocation_id: g.allocOwn,
        role: 'Backend Dev',
        session,
      });
      expect(updated.version).toBe(2);
      await expect(
        removeAllocation({ allocation_id: g.allocOwn, session }),
      ).resolves.toBeUndefined();
    }));

  it('self-scoped manage is denied on projects the EM does not own', () =>
    run(async (g) => {
      const session = emSession(g.t, g.W_em);
      // Visible through tenant-wide read, but not manageable → FORBIDDEN, not silent success.
      await expect(createAllocation({ ...newAlloc(g.P_other), session })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(
        updateAllocation({ allocation_id: g.allocOther, role: 'X', session }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        removeAllocation({ allocation_id: g.allocOther, session }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }));

  it('a project invisible to the caller stays NOT_FOUND (no existence leak)', () =>
    run(async (g) => {
      // Self-scoped read AND manage, no relationships at all.
      const session = buildSession({
        tenant_id: g.t.tenant_id,
        user_id: crypto.randomUUID(),
        roles: ['pm.manager'],
        assignments: [
          { role_slug: 'pm.viewer', scope_kind: 'self', scope_id: null },
          { role_slug: 'pm.manager', scope_kind: 'self', scope_id: null },
        ],
        worker_id: crypto.randomUUID(),
      });
      await expect(createAllocation({ ...newAlloc(g.P_other), session })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    }));

  it('tenant-scoped manager keeps managing every project', () =>
    run(async (g) => {
      const session = buildSession({
        tenant_id: g.t.tenant_id,
        user_id: crypto.randomUUID(),
        roles: ['pm.manager'],
      });
      const created = await createAllocation({ ...newAlloc(g.P_other), session });
      expect(created.allocation_id).toBeTruthy();
    }));
});
