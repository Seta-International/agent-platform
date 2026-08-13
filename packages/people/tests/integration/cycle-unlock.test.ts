import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { afterEach, describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { performanceCycleUnlock } from '../../src/backend/db/schema.ts';
import { setMonthClock } from '../../src/backend/domain/month-clock.ts';
import {
  listCycleUnlocks,
  readCycleStatus,
  relockCycle,
  resolveOverrideActive,
  unlockCycle,
} from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

const MONTH = '2026-07';
function vn(y: number, m: number, d: number, h = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, h, 0, 0, 0) - 7 * 3_600_000);
}

type UnlockRow = {
  scope_kind: 'month' | 'project' | 'person';
  scope_id: string | null;
  action: 'unlock' | 'relock';
  created_at: Date;
};

async function seedUnlocks(tenantId: string, rows: UnlockRow[]): Promise<void> {
  await peopleDb()
    .insert(performanceCycleUnlock)
    .values(
      rows.map((r) => ({
        tenant_id: tenantId,
        review_month: MONTH,
        scope_kind: r.scope_kind,
        scope_id: r.scope_id,
        action: r.action,
        reason: 'test',
        actor_user_id: crypto.randomUUID(),
        created_at: r.created_at,
      })),
    );
}

afterEach(() => setMonthClock());

describe('resolveOverrideActive', () => {
  it('false with no unlock rows', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        expect(await resolveOverrideActive(t.adminSession, { month: MONTH })).toBe(false);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('a month-wide unlock activates the override for any scope', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await seedUnlocks(t.tenant_id, [
          { scope_kind: 'month', scope_id: null, action: 'unlock', created_at: vn(2026, 8, 13) },
        ]);
        expect(await resolveOverrideActive(t.adminSession, { month: MONTH })).toBe(true);
        expect(
          await resolveOverrideActive(t.adminSession, {
            month: MONTH,
            person_id: crypto.randomUUID(),
            project_id: crypto.randomUUID(),
          }),
        ).toBe(true);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('a later re-lock cancels an earlier unlock (latest row per scope wins)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await seedUnlocks(t.tenant_id, [
          { scope_kind: 'month', scope_id: null, action: 'unlock', created_at: vn(2026, 8, 13, 9) },
          {
            scope_kind: 'month',
            scope_id: null,
            action: 'relock',
            created_at: vn(2026, 8, 13, 10),
          },
        ]);
        expect(await resolveOverrideActive(t.adminSession, { month: MONTH })).toBe(false);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('a person-scoped unlock only activates for that person', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const alice = crypto.randomUUID();
        const bob = crypto.randomUUID();
        await seedUnlocks(t.tenant_id, [
          { scope_kind: 'person', scope_id: alice, action: 'unlock', created_at: vn(2026, 8, 13) },
        ]);
        expect(
          await resolveOverrideActive(t.adminSession, { month: MONTH, person_id: alice }),
        ).toBe(true);
        expect(await resolveOverrideActive(t.adminSession, { month: MONTH, person_id: bob })).toBe(
          false,
        );
        expect(await resolveOverrideActive(t.adminSession, { month: MONTH })).toBe(false);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('a project-scoped unlock only activates for that project', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projA = crypto.randomUUID();
        const projB = crypto.randomUUID();
        await seedUnlocks(t.tenant_id, [
          { scope_kind: 'project', scope_id: projA, action: 'unlock', created_at: vn(2026, 8, 13) },
        ]);
        expect(
          await resolveOverrideActive(t.adminSession, { month: MONTH, project_id: projA }),
        ).toBe(true);
        expect(
          await resolveOverrideActive(t.adminSession, { month: MONTH, project_id: projB }),
        ).toBe(false);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});

function pmoSession(tenantId: string) {
  return buildSession({
    tenant_id: tenantId,
    user_id: crypto.randomUUID(),
    roles: ['pm.pmo'],
    person_id: crypto.randomUUID(),
    assignments: [{ role_slug: 'pm.pmo', scope_kind: 'tenant', scope_id: null }],
  });
}

describe('unlockCycle / relockCycle (FUT-781, AC1-AC4)', () => {
  it('rejects a caller without people.performance.unlock (PMO-only)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const member = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['people.viewer'],
          person_id: crypto.randomUUID(),
        });
        await expect(
          unlockCycle(member, { month: MONTH, scope_kind: 'month', scope_id: null, reason: 'x' }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('unlock writes an audit row and activates the override; relock reverses it', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const pmo = pmoSession(t.tenant_id);

        const entry = await unlockCycle(pmo, {
          month: MONTH,
          scope_kind: 'month',
          scope_id: null,
          reason: 'Payroll correction',
        });
        expect(entry.action).toBe('unlock');
        expect(entry.reason).toBe('Payroll correction');
        expect(entry.actor_user_id).toBe(pmo.user_id);
        expect(await resolveOverrideActive(pmo, { month: MONTH })).toBe(true);

        await relockCycle(pmo, {
          month: MONTH,
          scope_kind: 'month',
          scope_id: null,
          reason: 'Done',
        });
        expect(await resolveOverrideActive(pmo, { month: MONTH })).toBe(false);

        const log = await listCycleUnlocks(pmo, MONTH);
        expect(log.entries.map((e) => e.action)).toEqual(['relock', 'unlock']);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('blocks a stale double-unlock (two-tab concurrency): already unlocked → CONFLICT', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const pmo = pmoSession(t.tenant_id);
        await unlockCycle(pmo, { month: MONTH, scope_kind: 'month', scope_id: null, reason: 'a' });
        await expect(
          unlockCycle(pmo, { month: MONTH, scope_kind: 'month', scope_id: null, reason: 'b' }),
        ).rejects.toMatchObject({ code: 'CONFLICT' });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('blocks a relock when the scope is already locked → CONFLICT', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const pmo = pmoSession(t.tenant_id);
        await expect(
          relockCycle(pmo, { month: MONTH, scope_kind: 'month', scope_id: null, reason: 'x' }),
        ).rejects.toMatchObject({ code: 'CONFLICT' });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('a project-scoped unlock is independent of a person-scoped unlock', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const pmo = pmoSession(t.tenant_id);
        const proj = crypto.randomUUID();
        const person = crypto.randomUUID();
        await unlockCycle(pmo, {
          month: MONTH,
          scope_kind: 'project',
          scope_id: proj,
          reason: 'proj',
        });
        // Same-scope re-unlock is blocked, but a different scope is unaffected.
        const personEntry = await unlockCycle(pmo, {
          month: MONTH,
          scope_kind: 'person',
          scope_id: person,
          reason: 'person',
        });
        expect(personEntry.scope_kind).toBe('person');
        expect(await resolveOverrideActive(pmo, { month: MONTH, project_id: proj })).toBe(true);
        expect(await resolveOverrideActive(pmo, { month: MONTH, person_id: person })).toBe(true);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});

describe('readCycleStatus honors manual unlock (FUT-781)', () => {
  it('reports override in a locked window when the month is unlocked', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        // Aug 13 is a locked window for the July cycle.
        setMonthClock(() => vn(2026, 8, 13, 10));
        const before = await readCycleStatus(t.adminSession, { month: MONTH });
        expect(before.status).toBe('locked');

        await seedUnlocks(t.tenant_id, [
          { scope_kind: 'month', scope_id: null, action: 'unlock', created_at: vn(2026, 8, 13, 9) },
        ]);
        const after = await readCycleStatus(t.adminSession, { month: MONTH });
        expect(after.status).toBe('override');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
