// packages/hiring/tests/integration/project-owner-projection.test.ts
// FUT-328: hiring's local {project_id <-> owner worker_id} read-model, fed by
// pm.project.access.changed, which always carries the *current* full owner set.
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools, scoped } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { DomainEvent } from '@seta/shared-types';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import { projectOwnerProjection } from '../../src/backend/db/schema.ts';
import { projectOwnerProjectionAccessChanged } from '../../src/backend/subscribers/project-owner-projection.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function accessChangedEvent(
  tenant_id: string,
  project_id: string,
  owner_worker_ids: string[],
): DomainEvent<unknown> {
  return { payload: { project_id, tenant_id, owner_worker_ids } } as DomainEvent<unknown>;
}

async function ownersOf(tenant_id: string, project_id: string) {
  const rows = await scoped(tenant_id, () =>
    hiringDb()
      .select({ worker_id: projectOwnerProjection.worker_id })
      .from(projectOwnerProjection)
      .where(eq(projectOwnerProjection.project_id, project_id)),
  );
  return rows.map((r) => r.worker_id).sort();
}

describe('project_owner_projection subscriber', () => {
  it('seeds owners on first event, idempotently', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const project_id = crypto.randomUUID();
        const pm = crypto.randomUUID();
        const evt = accessChangedEvent(t.tenant_id, project_id, [pm]);

        await scoped(t.tenant_id, () =>
          projectOwnerProjectionAccessChanged.handler(evt, { tx: hiringDb() }),
        );
        await scoped(t.tenant_id, () =>
          projectOwnerProjectionAccessChanged.handler(evt, { tx: hiringDb() }),
        );

        expect(await ownersOf(t.tenant_id, project_id)).toEqual([pm]);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('adds a newly-granted owner without dropping the existing one', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const project_id = crypto.randomUUID();
        const pm = crypto.randomUUID();
        const leader = crypto.randomUUID();

        await scoped(t.tenant_id, () =>
          projectOwnerProjectionAccessChanged.handler(
            accessChangedEvent(t.tenant_id, project_id, [pm]),
            { tx: hiringDb() },
          ),
        );
        await scoped(t.tenant_id, () =>
          projectOwnerProjectionAccessChanged.handler(
            accessChangedEvent(t.tenant_id, project_id, [pm, leader]),
            { tx: hiringDb() },
          ),
        );

        expect(await ownersOf(t.tenant_id, project_id)).toEqual([leader, pm].sort());
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('removes an owner that is no longer in the current set', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const project_id = crypto.randomUUID();
        const pm = crypto.randomUUID();
        const leader = crypto.randomUUID();

        await scoped(t.tenant_id, () =>
          projectOwnerProjectionAccessChanged.handler(
            accessChangedEvent(t.tenant_id, project_id, [pm, leader]),
            { tx: hiringDb() },
          ),
        );
        // leader revoked
        await scoped(t.tenant_id, () =>
          projectOwnerProjectionAccessChanged.handler(
            accessChangedEvent(t.tenant_id, project_id, [pm]),
            { tx: hiringDb() },
          ),
        );

        expect(await ownersOf(t.tenant_id, project_id)).toEqual([pm]);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it("does not touch another project's owners", async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectA = crypto.randomUUID();
        const projectB = crypto.randomUUID();
        const workerA = crypto.randomUUID();
        const workerB = crypto.randomUUID();

        await scoped(t.tenant_id, () =>
          projectOwnerProjectionAccessChanged.handler(
            accessChangedEvent(t.tenant_id, projectA, [workerA]),
            { tx: hiringDb() },
          ),
        );
        await scoped(t.tenant_id, () =>
          projectOwnerProjectionAccessChanged.handler(
            accessChangedEvent(t.tenant_id, projectB, [workerB]),
            { tx: hiringDb() },
          ),
        );

        expect(await ownersOf(t.tenant_id, projectA)).toEqual([workerA]);
        expect(await ownersOf(t.tenant_id, projectB)).toEqual([workerB]);

        const all = await scoped(t.tenant_id, () =>
          hiringDb()
            .select()
            .from(projectOwnerProjection)
            .where(and(eq(projectOwnerProjection.tenant_id, t.tenant_id))),
        );
        expect(all).toHaveLength(2);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
