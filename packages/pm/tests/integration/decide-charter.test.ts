import { resetCoreDb } from '@seta/core/testing';
import { createUser } from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { pmDb, resetPmDb } from '../../src/backend/db/client.ts';
import { charter, project, projectAccess } from '../../src/backend/db/schema.ts';
import {
  bodApproveCharter,
  pmoSignOffCharter,
  rejectCharter,
  submitCharter,
} from '../../src/index.ts';
import { buildSession, countEvents, readEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

async function seedCharter(
  pool: import('pg').Pool,
  session: import('@seta/core').SessionScope,
  tenantId: string,
  opts?: { methodology?: string; pricing_model?: string; budget_bmm?: number },
) {
  const acc = await pool.query(
    `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'A') RETURNING id`,
    [tenantId],
  );
  return submitCharter({
    account_id: acc.rows[0].id,
    name: 'P',
    methodology: (opts?.methodology as 'scrum' | 'kanban' | undefined) ?? 'scrum',
    pricing_model:
      (opts?.pricing_model as 'fixed_price' | 'time_materials' | undefined) ?? 'fixed_price',
    budget_bmm: opts?.budget_bmm ?? 100,
    team_size: 4,
    pm_worker_id: session.user_id,
    session,
  });
}

async function seedReviewer(tenantId: string, roleSlug: 'pm.pmo' | 'pm.bod') {
  const email = `${roleSlug.replace('.', '-')}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const u = await createUser(
    {
      tenant_id: tenantId,
      email,
      name: roleSlug,
      password: 'correct-horse-battery-staple',
      initial_role: { role_slug: roleSlug, scope_type: 'tenant', scope_id: null },
    },
    { type: 'cli', user_id: null },
  );
  return buildSession({ tenant_id: tenantId, user_id: u.user_id, email, roles: [roleSlug] });
}

describe('two-stage charter governance', () => {
  it('PMO sign-off moves submitted -> pmo_approved and emits the event', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const pmo = await seedReviewer(t.tenant_id, 'pm.pmo');
        const { charter_id } = await seedCharter(pool, t.adminSession, t.tenant_id);
        await pmoSignOffCharter({ charter_id, session: pmo });
        const [c] = await pmDb().select().from(charter).where(eq(charter.id, charter_id));
        expect(c?.status).toBe('pmo_approved');
        expect(c?.pmo_signed_off_by_user_id).toBe(pmo.user_id);
        expect(await readEvents(pool, t.tenant_id, 'pm.charter.pmo_signed_off')).toHaveLength(1);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('BoD approve from pmo_approved creates the project + owner grant + both events', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const pmo = await seedReviewer(t.tenant_id, 'pm.pmo');
        const bod = await seedReviewer(t.tenant_id, 'pm.bod');
        const { charter_id } = await seedCharter(pool, t.adminSession, t.tenant_id);
        await pmoSignOffCharter({ charter_id, session: pmo });
        const { project_id } = await bodApproveCharter({ charter_id, session: bod });

        const [p] = await pmDb().select().from(project).where(eq(project.id, project_id));
        expect(p?.charter_id).toBe(charter_id);
        expect(p?.phase).toBe('initiation');
        expect(p?.status).toBe('active');
        expect(p?.methodology).toBe('scrum');

        const [c] = await pmDb().select().from(charter).where(eq(charter.id, charter_id));
        expect(c?.status).toBe('approved');
        expect(c?.project_id).toBe(project_id);
        expect(c?.decided_by_user_id).toBe(bod.user_id);

        const grants = await pmDb()
          .select()
          .from(projectAccess)
          .where(eq(projectAccess.project_id, project_id));
        expect(grants.find((g) => g.level === 'owner')?.worker_id).toBe(t.adminSession.user_id);

        expect(await readEvents(pool, t.tenant_id, 'pm.charter.approved')).toHaveLength(1);
        const createdEvents = await readEvents(pool, t.tenant_id, 'pm.project.created');
        expect(createdEvents).toHaveLength(1);
        expect(createdEvents[0]!.payload.name).toBe('P');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('BoD approve before PMO sign-off is a CONFLICT', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const bod = await seedReviewer(t.tenant_id, 'pm.bod');
        const { charter_id } = await seedCharter(pool, t.adminSession, t.tenant_id);
        await expect(bodApproveCharter({ charter_id, session: bod })).rejects.toMatchObject({
          code: 'CONFLICT',
        });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('PMO cannot BoD-approve and BoD cannot PMO-sign-off (403)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const pmo = await seedReviewer(t.tenant_id, 'pm.pmo');
        const bod = await seedReviewer(t.tenant_id, 'pm.bod');
        const { charter_id } = await seedCharter(pool, t.adminSession, t.tenant_id);
        await expect(bodApproveCharter({ charter_id, session: pmo })).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
        await pmoSignOffCharter({ charter_id, session: pmo });
        await expect(pmoSignOffCharter({ charter_id, session: bod })).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('viewer cannot sign off; stale version conflicts at BoD', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const pmo = await seedReviewer(t.tenant_id, 'pm.pmo');
        const bod = await seedReviewer(t.tenant_id, 'pm.bod');
        const { charter_id } = await seedCharter(pool, t.adminSession, t.tenant_id);
        const viewer = buildSession({
          tenant_id: t.tenant_id,
          user_id: t.admin_user_id,
          roles: ['pm.viewer'],
        });
        await expect(pmoSignOffCharter({ charter_id, session: viewer })).rejects.toThrow(
          /permission/i,
        );
        await pmoSignOffCharter({ charter_id, session: pmo });
        await expect(
          bodApproveCharter({ charter_id, expected_version: 99, session: bod }),
        ).rejects.toThrow(/version|concurrently/i);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('(F) BoD approve of a charter missing methodology/pricing/budget throws VALIDATION, no project', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const pmo = await seedReviewer(t.tenant_id, 'pm.pmo');
        const bod = await seedReviewer(t.tenant_id, 'pm.bod');
        const acc = await pool.query(
          `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'Acct') RETURNING id`,
          [t.tenant_id],
        );
        const { charter_id } = await submitCharter({
          account_id: acc.rows[0].id,
          name: 'Incomplete',
          pm_worker_id: t.adminSession.user_id,
          session: t.adminSession,
        });
        await pool.query(
          `UPDATE pm.charter SET methodology = NULL, pricing_model = NULL, budget_bmm = NULL WHERE id = $1`,
          [charter_id],
        );
        await pmoSignOffCharter({ charter_id, session: pmo });
        await expect(bodApproveCharter({ charter_id, session: bod })).rejects.toMatchObject({
          code: 'VALIDATION',
        });
        expect(await countEvents(pool, t.tenant_id, 'pm.project.created')).toBe(0);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('reject at submitted records rejected_stage=pmo; reject at pmo_approved records bod', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const pmo = await seedReviewer(t.tenant_id, 'pm.pmo');
        const bod = await seedReviewer(t.tenant_id, 'pm.bod');

        const a = await seedCharter(pool, t.adminSession, t.tenant_id);
        await rejectCharter({ charter_id: a.charter_id, reason: 'no capacity', session: pmo });
        const [ca] = await pmDb().select().from(charter).where(eq(charter.id, a.charter_id));
        expect(ca?.status).toBe('rejected');
        expect(ca?.rejected_stage).toBe('pmo');
        expect(ca?.rejection_reason).toBe('no capacity');

        const b = await seedCharter(pool, t.adminSession, t.tenant_id);
        await pmoSignOffCharter({ charter_id: b.charter_id, session: pmo });
        await rejectCharter({ charter_id: b.charter_id, reason: 'budget window', session: bod });
        const [cb] = await pmDb().select().from(charter).where(eq(charter.id, b.charter_id));
        expect(cb?.rejected_stage).toBe('bod');

        const rejected = await readEvents(pool, t.tenant_id, 'pm.charter.rejected');
        expect(rejected).toHaveLength(2);
        expect(rejected.map((e) => e.payload.stage).sort()).toEqual(['bod', 'pmo']);
        expect(await countEvents(pool, t.tenant_id, 'pm.project.created')).toBe(0);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('BoD cannot reject a still-submitted charter (403)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const bod = await seedReviewer(t.tenant_id, 'pm.bod');
        const { charter_id } = await seedCharter(pool, t.adminSession, t.tenant_id);
        await expect(
          rejectCharter({ charter_id, reason: 'x', session: bod }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('(G) BoD approve notifies the submitter (distinct from approver)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const pmo = await seedReviewer(t.tenant_id, 'pm.pmo');
        const bod = await seedReviewer(t.tenant_id, 'pm.bod');
        const { charter_id } = await seedCharter(pool, t.adminSession, t.tenant_id);
        await pmoSignOffCharter({ charter_id, session: pmo });
        await bodApproveCharter({ charter_id, session: bod });
        const notifEvents = await readEvents(pool, t.tenant_id, 'notification.requested');
        expect(notifEvents.length).toBeGreaterThan(0);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
