import { resetCoreDb } from '@seta/core/testing';
import { createUser } from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { pmDb, resetPmDb } from '../../src/backend/db/client.ts';
import { charter } from '../../src/backend/db/schema.ts';
import { editCharter, pmoSignOffCharter, submitCharter, withdrawCharter } from '../../src/index.ts';
import { buildSession, readEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

async function seedAccount(pool: import('pg').Pool, tenantId: string): Promise<string> {
  const r = await pool.query(
    `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'A') RETURNING id`,
    [tenantId],
  );
  return r.rows[0].id;
}

describe('submitCharter / editCharter / withdrawCharter', () => {
  it('submits a charter and emits pm.charter.submitted', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const accountId = await seedAccount(pool, t.tenant_id);
        const { charter_id } = await submitCharter({
          account_id: accountId,
          name: 'New Proj',
          methodology: 'scrum',
          pm_worker_id: crypto.randomUUID(),
          session: t.adminSession,
        });
        const [c] = await pmDb().select().from(charter).where(eq(charter.id, charter_id));
        expect(c?.status).toBe('submitted');
        expect(await readEvents(pool, t.tenant_id, 'pm.charter.submitted')).toHaveLength(1);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('edits only while submitted and bumps version', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const accountId = await seedAccount(pool, t.tenant_id);
        const { charter_id } = await submitCharter({
          account_id: accountId,
          name: 'P',
          pm_worker_id: crypto.randomUUID(),
          session: t.adminSession,
        });
        const { version } = await editCharter({
          charter_id,
          patch: { name: 'P2' },
          session: t.adminSession,
        });
        expect(version).toBe(2);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects viewer (no submit permission)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const accountId = await seedAccount(pool, t.tenant_id);
        const viewer = buildSession({
          tenant_id: t.tenant_id,
          user_id: t.admin_user_id,
          roles: ['pm.viewer'],
        });
        await expect(
          submitCharter({
            account_id: accountId,
            name: 'X',
            pm_worker_id: crypto.randomUUID(),
            session: viewer,
          }),
        ).rejects.toThrow(/permission/i);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('(B) rejects bogus/cross-tenant account_id with NOT_FOUND', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const bogusId = crypto.randomUUID();
        await expect(
          submitCharter({
            account_id: bogusId,
            name: 'X',
            pm_worker_id: crypto.randomUUID(),
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('stores submitted_by_user_id on the charter row', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const accountId = await seedAccount(pool, t.tenant_id);
        const { charter_id } = await submitCharter({
          account_id: accountId,
          name: 'SubBy',
          pm_worker_id: crypto.randomUUID(),
          session: t.adminSession,
        });
        const [c] = await pmDb().select().from(charter).where(eq(charter.id, charter_id));
        expect(c?.submitted_by_user_id).toBe(t.admin_user_id);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('submit emits notification.requested targeting pm.pmo reviewers', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        // Seed a pm.pmo reviewer so recipients is non-empty
        const pmoEmail = `pmo-${crypto.randomUUID().slice(0, 8)}@example.test`;
        const pmoResult = await createUser(
          {
            tenant_id: t.tenant_id,
            email: pmoEmail,
            name: 'PMO Reviewer',
            password: 'correct-horse-battery-staple',
            initial_role: { role_slug: 'pm.pmo', scope_type: 'tenant', scope_id: null },
          },
          { type: 'cli', user_id: null },
        );

        const accountId = await seedAccount(pool, t.tenant_id);
        await submitCharter({
          account_id: accountId,
          name: 'NotifyTest',
          pm_worker_id: crypto.randomUUID(),
          session: t.adminSession,
        });
        const notifEvents = await readEvents(pool, t.tenant_id, 'notification.requested');
        expect(notifEvents.length).toBeGreaterThan(0);
        const recipientLists = notifEvents.map((e) => e.payload.user_ids as string[]);
        expect(recipientLists.some((ids) => ids?.includes(pmoResult.user_id))).toBe(true);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('withdrawCharter flips submitted→withdrawn and emits pm.charter.withdrawn', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const accountId = await seedAccount(pool, t.tenant_id);
        const { charter_id } = await submitCharter({
          account_id: accountId,
          name: 'ToWithdraw',
          pm_worker_id: crypto.randomUUID(),
          session: t.adminSession,
        });
        const { version } = await withdrawCharter({ charter_id, session: t.adminSession });
        expect(version).toBe(2);
        const [c] = await pmDb().select().from(charter).where(eq(charter.id, charter_id));
        expect(c?.status).toBe('withdrawn');
        expect(await readEvents(pool, t.tenant_id, 'pm.charter.withdrawn')).toHaveLength(1);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('submitter can withdraw a pmo_approved charter', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const pmoEmail = `pmo-${crypto.randomUUID().slice(0, 8)}@example.test`;
        const pmoResult = await createUser(
          {
            tenant_id: t.tenant_id,
            email: pmoEmail,
            name: 'PMO',
            password: 'correct-horse-battery-staple',
            initial_role: { role_slug: 'pm.pmo', scope_type: 'tenant', scope_id: null },
          },
          { type: 'cli', user_id: null },
        );
        const pmo = buildSession({
          tenant_id: t.tenant_id,
          user_id: pmoResult.user_id,
          email: pmoEmail,
          roles: ['pm.pmo'],
        });
        const accountId = await seedAccount(pool, t.tenant_id);
        const { charter_id } = await submitCharter({
          account_id: accountId,
          name: 'WithdrawAfterPmo',
          pm_worker_id: crypto.randomUUID(),
          session: t.adminSession,
        });
        await pmoSignOffCharter({ charter_id, session: pmo });
        await withdrawCharter({ charter_id, session: t.adminSession });
        const [c] = await pmDb().select().from(charter).where(eq(charter.id, charter_id));
        expect(c?.status).toBe('withdrawn');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('non-submitter cannot withdraw (FORBIDDEN)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const accountId = await seedAccount(pool, t.tenant_id);
        const { charter_id } = await submitCharter({
          account_id: accountId,
          name: 'NoWithdraw',
          pm_worker_id: crypto.randomUUID(),
          session: t.adminSession,
        });

        // Create a different pm.strategic user who is NOT the submitter
        const otherEmail = `other-${crypto.randomUUID().slice(0, 8)}@example.test`;
        const otherResult = await createUser(
          {
            tenant_id: t.tenant_id,
            email: otherEmail,
            name: 'Other Strategic',
            password: 'correct-horse-battery-staple',
            initial_role: { role_slug: 'pm.strategic', scope_type: 'tenant', scope_id: null },
          },
          { type: 'cli', user_id: null },
        );
        const otherSession = buildSession({
          tenant_id: t.tenant_id,
          user_id: otherResult.user_id,
          email: otherEmail,
          roles: ['pm.strategic'],
        });

        await expect(withdrawCharter({ charter_id, session: otherSession })).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
