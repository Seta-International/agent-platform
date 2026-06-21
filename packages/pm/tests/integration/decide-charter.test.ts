import { resetCoreDb } from '@seta/core/testing';
import { createUser } from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { pmDb, resetPmDb } from '../../src/backend/db/client.ts';
import { charter, project, projectAccess } from '../../src/backend/db/schema.ts';
import { approveCharter, rejectCharter, submitCharter } from '../../src/index.ts';
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

describe('approveCharter / rejectCharter', () => {
  it('approve atomically creates the project, owner grant, and both events', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { charter_id } = await seedCharter(pool, t.adminSession, t.tenant_id);
        const { project_id } = await approveCharter({ charter_id, session: t.adminSession });

        const [p] = await pmDb().select().from(project).where(eq(project.id, project_id));
        expect(p?.charter_id).toBe(charter_id);
        expect(p?.phase).toBe('initiation');
        expect(p?.status).toBe('active');
        expect(p?.methodology).toBe('scrum');

        const [c] = await pmDb().select().from(charter).where(eq(charter.id, charter_id));
        expect(c?.status).toBe('approved');
        expect(c?.project_id).toBe(project_id);
        expect(c?.decided_by_user_id).toBe(t.admin_user_id);

        const grants = await pmDb()
          .select()
          .from(projectAccess)
          .where(eq(projectAccess.project_id, project_id));
        expect(grants.find((g) => g.level === 'owner')?.worker_id).toBe(t.adminSession.user_id);

        expect(await readEvents(pool, t.tenant_id, 'pm.charter.approved')).toHaveLength(1);
        const createdEvents = await readEvents(pool, t.tenant_id, 'pm.project.created');
        expect(createdEvents).toHaveLength(1);
        expect(createdEvents[0]!.payload.name).toBe('P');
        expect(typeof createdEvents[0]!.payload.account_id).toBe('string');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('reject closes the charter with a reason and creates no project', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { charter_id } = await seedCharter(pool, t.adminSession, t.tenant_id);
        await rejectCharter({ charter_id, reason: 'no capacity', session: t.adminSession });
        const [c] = await pmDb().select().from(charter).where(eq(charter.id, charter_id));
        expect(c?.status).toBe('rejected');
        expect(c?.rejection_reason).toBe('no capacity');
        expect(c?.decided_by_user_id).toBe(t.admin_user_id);
        expect(await countEvents(pool, t.tenant_id, 'pm.project.created')).toBe(0);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('viewer cannot approve; stale version conflicts', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { charter_id } = await seedCharter(pool, t.adminSession, t.tenant_id);
        const viewer = buildSession({
          tenant_id: t.tenant_id,
          user_id: t.admin_user_id,
          roles: ['pm.viewer'],
        });
        await expect(approveCharter({ charter_id, session: viewer })).rejects.toThrow(
          /permission/i,
        );
        await expect(
          approveCharter({ charter_id, expected_version: 99, session: t.adminSession }),
        ).rejects.toThrow(/version|concurrently/i);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('(F) approving a charter missing methodology/pricing/budget throws VALIDATION and creates no project', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        // Submit a minimal charter without methodology/pricing/budget
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
        // Force-null the fields that the completeness gate checks
        await pool.query(
          `UPDATE pm.charter SET methodology = NULL, pricing_model = NULL, budget_bmm = NULL WHERE id = $1`,
          [charter_id],
        );
        await expect(approveCharter({ charter_id, session: t.adminSession })).rejects.toMatchObject(
          { code: 'VALIDATION' },
        );
        expect(await countEvents(pool, t.tenant_id, 'pm.project.created')).toBe(0);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('(G) approve notifies the submitter when submitter and approver are different users', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        // Seed a second pm.strategic user who will be the approver
        const approverEmail = `approver-${crypto.randomUUID().slice(0, 8)}@example.test`;
        const approverResult = await createUser(
          {
            tenant_id: t.tenant_id,
            email: approverEmail,
            name: 'Approver User',
            password: 'correct-horse-battery-staple',
            initial_role: { role_slug: 'pm.strategic', scope_type: 'tenant', scope_id: null },
          },
          { type: 'cli', user_id: null },
        );
        const approverSession = buildSession({
          tenant_id: t.tenant_id,
          user_id: approverResult.user_id,
          email: approverEmail,
          roles: ['pm.strategic'],
        });

        // Submit charter as user A (t.adminSession), approve as user B (approverSession)
        const { charter_id } = await seedCharter(pool, t.adminSession, t.tenant_id);
        await approveCharter({ charter_id, session: approverSession });

        const notifEvents = await readEvents(pool, t.tenant_id, 'notification.requested');
        expect(notifEvents.length).toBeGreaterThan(0);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('(G) approve does NOT notify when submitter === approver', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        // Same user submits and approves — no notification.requested should fire
        const { charter_id } = await seedCharter(pool, t.adminSession, t.tenant_id);
        await approveCharter({ charter_id, session: t.adminSession });
        // submit-charter also fires notification.requested (to other pm.strategics); but since
        // there are no other pm.strategics here, that should also be 0.
        // We only assert no notification was issued for the approve path.
        const notifEvents = await readEvents(pool, t.tenant_id, 'notification.requested');
        expect(notifEvents).toHaveLength(0);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
