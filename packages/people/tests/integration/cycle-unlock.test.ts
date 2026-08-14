import { resetCoreDb } from '@seta/core/testing';
import { createAccount } from '@seta/pm';
import { resetPmDb } from '@seta/pm/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { afterEach, describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { performanceCycleUnlock } from '../../src/backend/db/schema.ts';
import { createWorker } from '../../src/backend/domain/create-worker.ts';
import { setMonthClock } from '../../src/backend/domain/month-clock.ts';
import {
  readCycleStatus,
  readCycleUnlockPanel,
  relockCycle,
  resolveOverrideActive,
  unlockCycle,
} from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

/** VN wall-clock → UTC instant. */
function vn(y: number, m: number, d: number, h = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, h, 0, 0, 0) - 7 * 3_600_000);
}

/** Aug 13 2026: July is the latest closed cycle, so July is the unlockable month. */
const NOW = vn(2026, 8, 13, 10);
const UNLOCKABLE = '2026-07';
const OLDER = '2026-06';

afterEach(() => setMonthClock());

function pmoSession(tenantId: string) {
  return buildSession({
    tenant_id: tenantId,
    user_id: crypto.randomUUID(),
    roles: ['pm.pmo'],
    person_id: crypto.randomUUID(),
    assignments: [{ role_slug: 'pm.pmo', scope_kind: 'tenant', scope_id: null }],
  });
}

function pmManagerSession(tenantId: string) {
  return buildSession({
    tenant_id: tenantId,
    user_id: crypto.randomUUID(),
    roles: ['pm.manager'],
    assignments: [{ role_slug: 'pm.manager', scope_kind: 'tenant', scope_id: null }],
  });
}

/** Seed one real pm account so the panel can name it. */
async function seedAccount(tenantId: string, adminSession: ReturnType<typeof buildSession>) {
  const am = await createWorker({ session: adminSession, full_name: 'Ada AM' });
  const { account_id } = await createAccount({
    name: 'Contoso',
    am_worker_id: am.worker_id,
    session: pmManagerSession(tenantId),
  });
  return account_id;
}

async function withDb(fn: Parameters<typeof withTestDb>[1]): Promise<void> {
  await withTestDb(ctx, async (args) => {
    resetCoreDb();
    resetPeopleDb();
    resetPmDb();
    initPools({ databaseUrl: args.databaseUrl });
    try {
      await fn(args);
    } finally {
      resetPeopleDb();
      resetPmDb();
      resetCoreDb();
      await closePools();
    }
  });
}

describe('unlockCycle (FUT-781)', () => {
  it('rejects a caller without people.performance.unlock', async () => {
    await withDb(async ({ pool }) => {
      const t = await seedTenant(pool);
      setMonthClock(() => NOW);
      const member = buildSession({
        tenant_id: t.tenant_id,
        user_id: crypto.randomUUID(),
        roles: ['people.viewer'],
        person_id: crypto.randomUUID(),
      });
      await expect(
        unlockCycle(member, {
          month: UNLOCKABLE,
          account_id: crypto.randomUUID(),
          days: 3,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  it('unlocks one account for N days and expires on its own', async () => {
    await withDb(async ({ pool }) => {
      const t = await seedTenant(pool);
      const accountId = await seedAccount(t.tenant_id, t.adminSession);
      const pmo = pmoSession(t.tenant_id);
      setMonthClock(() => NOW);

      const entry = await unlockCycle(pmo, {
        month: UNLOCKABLE,
        account_id: accountId,
        days: 3,
      });
      expect(entry.action).toBe('unlock');
      expect(new Date(entry.expires_at as string).getTime()).toBe(NOW.getTime() + 3 * 86_400_000);

      expect(await resolveOverrideActive(pmo, { month: UNLOCKABLE, account_id: accountId })).toBe(
        true,
      );

      // One minute past the deadline the window closes with no job involved.
      setMonthClock(() => new Date(NOW.getTime() + 3 * 86_400_000 + 60_000));
      expect(await resolveOverrideActive(pmo, { month: UNLOCKABLE, account_id: accountId })).toBe(
        false,
      );
    });
  });

  it('leaves other accounts locked', async () => {
    await withDb(async ({ pool }) => {
      const t = await seedTenant(pool);
      const accountId = await seedAccount(t.tenant_id, t.adminSession);
      const other = crypto.randomUUID();
      const pmo = pmoSession(t.tenant_id);
      setMonthClock(() => NOW);

      await unlockCycle(pmo, {
        month: UNLOCKABLE,
        account_id: accountId,
        days: 2,
      });
      expect(await resolveOverrideActive(pmo, { month: UNLOCKABLE, account_id: other })).toBe(
        false,
      );
    });
  });

  it('refuses any month other than the latest closed cycle', async () => {
    await withDb(async ({ pool }) => {
      const t = await seedTenant(pool);
      const accountId = await seedAccount(t.tenant_id, t.adminSession);
      const pmo = pmoSession(t.tenant_id);
      setMonthClock(() => NOW);

      // Already signed off — view-only for good.
      await expect(
        unlockCycle(pmo, { month: OLDER, account_id: accountId, days: 1 }),
      ).rejects.toMatchObject({ code: 'VALIDATION' });

      // Not evaluable yet — its window opens on the 25th.
      await expect(
        unlockCycle(pmo, { month: '2026-08', account_id: accountId, days: 1 }),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });
  });

  it('caps the window at 5 days and requires at least 1', async () => {
    await withDb(async ({ pool }) => {
      const t = await seedTenant(pool);
      const accountId = await seedAccount(t.tenant_id, t.adminSession);
      const pmo = pmoSession(t.tenant_id);
      setMonthClock(() => NOW);

      for (const days of [0, 6, 30]) {
        await expect(
          unlockCycle(pmo, { month: UNLOCKABLE, account_id: accountId, days }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
      }
      const ok = await unlockCycle(pmo, {
        month: UNLOCKABLE,
        account_id: accountId,
        days: 5,
      });
      expect(ok.action).toBe('unlock');
    });
  });

  it('blocks a second unlock while one is still running (two-tab guard)', async () => {
    await withDb(async ({ pool }) => {
      const t = await seedTenant(pool);
      const accountId = await seedAccount(t.tenant_id, t.adminSession);
      const pmo = pmoSession(t.tenant_id);
      setMonthClock(() => NOW);

      await unlockCycle(pmo, { month: UNLOCKABLE, account_id: accountId, days: 2 });
      await expect(
        unlockCycle(pmo, { month: UNLOCKABLE, account_id: accountId, days: 2 }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });
  });

  it('allows a fresh unlock once the previous one has expired', async () => {
    await withDb(async ({ pool }) => {
      const t = await seedTenant(pool);
      const accountId = await seedAccount(t.tenant_id, t.adminSession);
      const pmo = pmoSession(t.tenant_id);
      setMonthClock(() => NOW);
      await unlockCycle(pmo, {
        month: UNLOCKABLE,
        account_id: accountId,
        days: 1,
      });

      setMonthClock(() => new Date(NOW.getTime() + 86_400_000 + 60_000));
      const again = await unlockCycle(pmo, {
        month: UNLOCKABLE,
        account_id: accountId,
        days: 5,
      });
      expect(again.action).toBe('unlock');
      expect(await resolveOverrideActive(pmo, { month: UNLOCKABLE, account_id: accountId })).toBe(
        true,
      );
    });
  });
});

describe('relockCycle (FUT-781)', () => {
  it('closes the window early and is refused when nothing is open', async () => {
    await withDb(async ({ pool }) => {
      const t = await seedTenant(pool);
      const accountId = await seedAccount(t.tenant_id, t.adminSession);
      const pmo = pmoSession(t.tenant_id);
      setMonthClock(() => NOW);

      await expect(
        relockCycle(pmo, { month: UNLOCKABLE, account_id: accountId }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });

      await unlockCycle(pmo, { month: UNLOCKABLE, account_id: accountId, days: 5 });
      const closed = await relockCycle(pmo, {
        month: UNLOCKABLE,
        account_id: accountId,
      });
      expect(closed.action).toBe('relock');
      expect(closed.expires_at).toBeNull();
      expect(await resolveOverrideActive(pmo, { month: UNLOCKABLE, account_id: accountId })).toBe(
        false,
      );
    });
  });
});

describe('readCycleUnlockPanel (FUT-781)', () => {
  it('names the unlockable month, each account state, and the trail newest-first', async () => {
    await withDb(async ({ pool }) => {
      const t = await seedTenant(pool);
      const accountId = await seedAccount(t.tenant_id, t.adminSession);
      const pmo = pmoSession(t.tenant_id);
      setMonthClock(() => NOW);

      const before = await readCycleUnlockPanel(pmo);
      expect(before.unlockable_month).toBe(UNLOCKABLE);
      expect(before.accounts).toEqual([
        { account_id: accountId, name: 'Contoso', unlocked_until: null },
      ]);
      expect(before.entries).toEqual([]);

      await unlockCycle(pmo, { month: UNLOCKABLE, account_id: accountId, days: 2 });
      const after = await readCycleUnlockPanel(pmo);
      expect(after.accounts[0]?.unlocked_until).toBe(
        new Date(NOW.getTime() + 2 * 86_400_000).toISOString(),
      );
      expect(after.entries.map((e) => e.action)).toEqual(['unlock']);
      expect(after.entries[0]?.account_id).toBe(accountId);
    });
  });

  it('reports an expired unlock as locked again', async () => {
    await withDb(async ({ pool }) => {
      const t = await seedTenant(pool);
      const accountId = await seedAccount(t.tenant_id, t.adminSession);
      const pmo = pmoSession(t.tenant_id);
      setMonthClock(() => NOW);
      await unlockCycle(pmo, { month: UNLOCKABLE, account_id: accountId, days: 1 });

      setMonthClock(() => new Date(NOW.getTime() + 2 * 86_400_000));
      const view = await readCycleUnlockPanel(pmo);
      expect(view.accounts[0]?.unlocked_until).toBeNull();
      // The audit row survives — expiry never rewrites history.
      expect(view.entries).toHaveLength(1);
    });
  });

  it('needs the same permission the panel acts with — people.performance.unlock', async () => {
    await withDb(async ({ pool }) => {
      const t = await seedTenant(pool);
      setMonthClock(() => NOW);
      const plain = buildSession({
        tenant_id: t.tenant_id,
        user_id: crypto.randomUUID(),
        roles: ['people.viewer'],
      });
      await expect(readCycleUnlockPanel(plain)).rejects.toMatchObject({ code: 'FORBIDDEN' });

      // An org-viewer who cannot unlock has nothing to do on this panel either.
      const orgViewerOnly = buildSession({
        tenant_id: t.tenant_id,
        user_id: crypto.randomUUID(),
        roles: ['people.manager'],
        assignments: [{ role_slug: 'people.manager', scope_kind: 'tenant', scope_id: null }],
      });
      // Assert the permission, not just the code: people.manager fails several checks
      // downstream, and only this one proves the panel's own gate rejected them.
      await expect(readCycleUnlockPanel(orgViewerOnly)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        details: { permission: 'people.performance.unlock' },
      });
    });
  });
});

describe('readCycleStatus honors an active unlock (FUT-781)', () => {
  it('flips a locked month to override for the unlocked account only', async () => {
    await withDb(async ({ pool }) => {
      const t = await seedTenant(pool);
      const accountId = await seedAccount(t.tenant_id, t.adminSession);
      const other = crypto.randomUUID();
      const pmo = pmoSession(t.tenant_id);
      setMonthClock(() => NOW);

      expect((await readCycleStatus(pmo, { month: UNLOCKABLE })).status).toBe('locked');

      await unlockCycle(pmo, { month: UNLOCKABLE, account_id: accountId, days: 2 });

      expect(
        (await readCycleStatus(pmo, { month: UNLOCKABLE, account_id: accountId })).status,
      ).toBe('override');
      expect((await readCycleStatus(pmo, { month: UNLOCKABLE, account_id: other })).status).toBe(
        'locked',
      );
    });
  });

  it('ignores an account the caller has no capacity on and cannot view org-wide', async () => {
    await withDb(async ({ pool }) => {
      const t = await seedTenant(pool);
      const accountId = await seedAccount(t.tenant_id, t.adminSession);
      const pmo = pmoSession(t.tenant_id);
      setMonthClock(() => NOW);
      await unlockCycle(pmo, { month: UNLOCKABLE, account_id: accountId, days: 2 });

      // A plain performance reader with no allocation on that account must not learn
      // its unlock state by guessing the id.
      const outsider = buildSession({
        tenant_id: t.tenant_id,
        user_id: crypto.randomUUID(),
        roles: ['people.viewer'],
        person_id: crypto.randomUUID(),
      });
      expect(
        (await readCycleStatus(outsider, { month: UNLOCKABLE, account_id: accountId })).status,
      ).toBe('locked');
    });
  });
});

describe('cycle unlock storage', () => {
  it('keeps every action as its own immutable row', async () => {
    await withDb(async ({ pool }) => {
      const t = await seedTenant(pool);
      const accountId = await seedAccount(t.tenant_id, t.adminSession);
      const pmo = pmoSession(t.tenant_id);
      setMonthClock(() => NOW);
      await unlockCycle(pmo, { month: UNLOCKABLE, account_id: accountId, days: 2 });
      await relockCycle(pmo, { month: UNLOCKABLE, account_id: accountId });

      const rows = await peopleDb().select().from(performanceCycleUnlock);
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.tenant_id === t.tenant_id)).toBe(true);
    });
  });
});
