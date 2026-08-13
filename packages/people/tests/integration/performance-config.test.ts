import { resetCoreDb } from '@seta/core/testing';
import { createAccount } from '@seta/pm';
import { resetPmDb } from '@seta/pm/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { and, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import {
  performanceConfigMonthPin,
  projectProjection,
  workerAllocationProjection,
} from '../../src/backend/db/schema.ts';
import { createWorker } from '../../src/backend/domain/create-worker.ts';
import { setMonthClock } from '../../src/backend/domain/month-clock.ts';
import { readPerformanceConfig, savePerformanceConfig } from '../../src/index.ts';
import { buildSession, linkUserToPerson, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

afterEach(() => setMonthClock());

function pmManagerSession(tenantId: string) {
  return buildSession({
    tenant_id: tenantId,
    user_id: crypto.randomUUID(),
    roles: ['pm.manager'],
    assignments: [{ role_slug: 'pm.manager', scope_kind: 'tenant', scope_id: null }],
  });
}

/** VN wall-clock helper — monthClock uses UTC+7 offset on the Date. */
function vn(year: number, month: number, day: number, hour = 12): Date {
  // Store as UTC instant that is `hour` in VN: VN = UTC+7 → UTC = hour-7
  return new Date(Date.UTC(year, month - 1, day, hour - 7));
}

describe('performance config (FUT-778)', () => {
  it('seeds r1 from template and returns real weights on GET', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const am = await createWorker({
          session: t.adminSession,
          full_name: 'Ada AM',
        });
        const userId = crypto.randomUUID();
        await linkUserToPerson(t.tenant_id, am.worker_id, userId);
        const { account_id } = await createAccount({
          name: 'Contoso',
          am_worker_id: am.worker_id,
          session: pmManagerSession(t.tenant_id),
        });

        const session = buildSession({
          tenant_id: t.tenant_id,
          user_id: userId,
          roles: ['people.viewer'],
          person_id: am.worker_id,
        });

        // Before open window so GET does not pin yet.
        setMonthClock(() => vn(2026, 7, 10));
        const cfg = await readPerformanceConfig(session, account_id);
        expect(cfg.revision_no).toBe(1);
        expect(cfg.applies_to_next_cycle).toBe(false);
        expect(cfg.groups).toHaveLength(5);
        const delivery = cfg.groups.find((g) => g.code === 'delivery');
        expect(delivery?.weight).toBe(20);
        expect(delivery?.criteria).toHaveLength(2);
        const tech = cfg.groups.find((g) => g.code === 'technical_excellence');
        expect(tech?.weight).toBe(25);
        expect(tech?.criteria.find((c) => c.name === 'Hard skill for role')?.weight).toBe(7);
        expect(cfg.groups.reduce((s, g) => s + g.weight, 0)).toBe(100);
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects save when group weights do not total 100', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const am = await createWorker({ session: t.adminSession, full_name: 'Ada AM' });
        const userId = crypto.randomUUID();
        await linkUserToPerson(t.tenant_id, am.worker_id, userId);
        const { account_id } = await createAccount({
          name: 'Contoso',
          am_worker_id: am.worker_id,
          session: pmManagerSession(t.tenant_id),
        });
        const session = buildSession({
          tenant_id: t.tenant_id,
          user_id: userId,
          roles: ['people.viewer'],
          person_id: am.worker_id,
        });
        setMonthClock(() => vn(2026, 7, 10));
        const cfg = await readPerformanceConfig(session, account_id);
        const groups = cfg.groups.map((g, i) => ({
          group_id: g.group_id,
          weight: i === 0 ? g.weight + 1 : g.weight,
          criteria: g.criteria.map((c) => ({
            name: c.name,
            weight: c.weight,
            sort: c.sort,
          })),
        }));
        // Fix criteria on first group to match bumped weight so AC4 passes and AC2 fails.
        const g0 = groups[0]!;
        g0.criteria[0] = { ...g0.criteria[0]!, weight: g0.criteria[0]!.weight + 1 };

        await expect(
          savePerformanceConfig(session, {
            account_id,
            base_revision_no: cfg.revision_no,
            groups,
          }),
        ).rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringMatching(/100/) });
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('saves a new revision and CONFLICT on stale base_revision_no', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const am = await createWorker({ session: t.adminSession, full_name: 'Ada AM' });
        const userId = crypto.randomUUID();
        await linkUserToPerson(t.tenant_id, am.worker_id, userId);
        const { account_id } = await createAccount({
          name: 'Contoso',
          am_worker_id: am.worker_id,
          session: pmManagerSession(t.tenant_id),
        });
        const session = buildSession({
          tenant_id: t.tenant_id,
          user_id: userId,
          roles: ['people.viewer'],
          person_id: am.worker_id,
        });
        setMonthClock(() => vn(2026, 7, 10));
        const cfg = await readPerformanceConfig(session, account_id);
        const payload = {
          account_id,
          base_revision_no: cfg.revision_no,
          groups: cfg.groups.map((g) => ({
            group_id: g.group_id,
            weight: g.weight,
            criteria: g.criteria.map((c) => ({
              name: c.name,
              weight: c.weight,
              sort: c.sort,
            })),
          })),
        };
        // Edit a criterion name.
        const delivery = payload.groups.find((_, i) => cfg.groups[i]?.code === 'delivery')!;
        delivery.criteria[0] = { ...delivery.criteria[0]!, name: 'Throughput & velocity (edited)' };

        const saved = await savePerformanceConfig(session, payload);
        expect(saved.revision_no).toBe(2);

        const again = await readPerformanceConfig(session, account_id);
        expect(again.revision_no).toBe(2);
        expect(
          again.groups
            .find((g) => g.code === 'delivery')
            ?.criteria.some((c) => c.name.includes('edited')),
        ).toBe(true);

        await expect(savePerformanceConfig(session, payload)).rejects.toMatchObject({
          code: 'CONFLICT',
        });
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('FORBIDDEN for non-AM and missing configure', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const am = await createWorker({ session: t.adminSession, full_name: 'Ada AM' });
        const other = await createWorker({ session: t.adminSession, full_name: 'Other' });
        const amUser = crypto.randomUUID();
        const otherUser = crypto.randomUUID();
        await linkUserToPerson(t.tenant_id, am.worker_id, amUser);
        await linkUserToPerson(t.tenant_id, other.worker_id, otherUser);
        const { account_id } = await createAccount({
          name: 'Contoso',
          am_worker_id: am.worker_id,
          session: pmManagerSession(t.tenant_id),
        });

        const stranger = buildSession({
          tenant_id: t.tenant_id,
          user_id: otherUser,
          roles: ['people.viewer'],
          person_id: other.worker_id,
        });
        await expect(readPerformanceConfig(stranger, account_id)).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });

        const noPerm = buildSession({
          tenant_id: t.tenant_id,
          user_id: amUser,
          roles: [],
          person_id: am.worker_id,
        });
        await expect(readPerformanceConfig(noPerm, account_id)).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('participant (TL/member) reads config without pinning the cycle', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const am = await createWorker({ session: t.adminSession, full_name: 'Ada AM' });
        const lead = await createWorker({ session: t.adminSession, full_name: 'Leo Lead' });
        await linkUserToPerson(t.tenant_id, am.worker_id, crypto.randomUUID());
        const leadUser = crypto.randomUUID();
        await linkUserToPerson(t.tenant_id, lead.worker_id, leadUser);
        const { account_id } = await createAccount({
          name: 'Contoso',
          am_worker_id: am.worker_id,
          session: pmManagerSession(t.tenant_id),
        });

        // Leo is a team lead allocated to a project under the AM's account.
        const projectId = crypto.randomUUID();
        const db = peopleDb();
        await db.insert(projectProjection).values({
          project_id: projectId,
          tenant_id: t.tenant_id,
          account_id,
          name: 'Alpha',
        });
        await db.insert(workerAllocationProjection).values({
          allocation_id: crypto.randomUUID(),
          tenant_id: t.tenant_id,
          person_id: lead.worker_id,
          project_id: projectId,
          account_id,
          lead_person_id: lead.worker_id,
          active: true,
        });

        const leadSession = buildSession({
          tenant_id: t.tenant_id,
          user_id: leadUser,
          roles: ['people.viewer'],
          person_id: lead.worker_id,
        });

        // Open window: an AM read would pin, but a participant read must not.
        setMonthClock(() => vn(2026, 7, 26));
        const cfg = await readPerformanceConfig(leadSession, account_id);
        expect(cfg.revision_no).toBe(1);
        expect(cfg.groups).toHaveLength(5);
        expect(cfg.applies_to_next_cycle).toBe(false);

        const pins = await db
          .select()
          .from(performanceConfigMonthPin)
          .where(
            and(
              eq(performanceConfigMonthPin.tenant_id, t.tenant_id),
              eq(performanceConfigMonthPin.account_id, account_id),
            ),
          );
        expect(pins).toHaveLength(0);
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('AC5: pin stays on first open-window head; later save bumps head only', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const am = await createWorker({ session: t.adminSession, full_name: 'Ada AM' });
        const userId = crypto.randomUUID();
        await linkUserToPerson(t.tenant_id, am.worker_id, userId);
        const { account_id } = await createAccount({
          name: 'Contoso',
          am_worker_id: am.worker_id,
          session: pmManagerSession(t.tenant_id),
        });
        const session = buildSession({
          tenant_id: t.tenant_id,
          user_id: userId,
          roles: ['people.viewer'],
          person_id: am.worker_id,
        });

        setMonthClock(() => vn(2026, 7, 10));
        const beforeOpen = await readPerformanceConfig(session, account_id);
        expect(beforeOpen.applies_to_next_cycle).toBe(false);
        const pinnedRevisionId = beforeOpen.revision_id;

        setMonthClock(() => vn(2026, 7, 26));
        const openCfg = await readPerformanceConfig(session, account_id);
        expect(openCfg.applies_to_next_cycle).toBe(true);
        expect(openCfg.revision_id).toBe(pinnedRevisionId);

        const payload = {
          account_id,
          base_revision_no: openCfg.revision_no,
          groups: openCfg.groups.map((g) => ({
            group_id: g.group_id,
            weight: g.weight,
            criteria: g.criteria.map((c) => ({
              name: c.name,
              weight: c.weight,
              sort: c.sort,
            })),
          })),
        };
        const saved = await savePerformanceConfig(session, payload);
        expect(saved.revision_no).toBe(2);
        expect(saved.applies_to_next_cycle).toBe(true);

        const [pin] = await peopleDb()
          .select()
          .from(performanceConfigMonthPin)
          .where(
            and(
              eq(performanceConfigMonthPin.tenant_id, t.tenant_id),
              eq(performanceConfigMonthPin.account_id, account_id),
              eq(performanceConfigMonthPin.review_month, '2026-07'),
            ),
          );
        expect(pin?.revision_id).toBe(pinnedRevisionId);

        const head = await readPerformanceConfig(session, account_id);
        expect(head.revision_no).toBe(2);
        expect(head.revision_id).not.toBe(pinnedRevisionId);
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
