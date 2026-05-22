import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  createGroup,
  createPlan,
  linkGroupToM365,
  linkPlanToM365,
  markPlanSyncStatus,
  type PlannerSessionScope,
} from '../../src/index.ts';
import { countEvents, readEvents, seedTenant } from '../helpers.ts';

const HARNESS = {
  templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.SETA_TEST_PG_BASE as string,
};

describe('markPlanSyncStatus', () => {
  async function seedLinkedPlan(pool: import('pg').Pool) {
    const seeded = await seedTenant(pool);
    const session = seeded.adminSession;
    const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G', session });
    await linkGroupToM365({ group_id: group.id, external_id: 'G-EXT', session });
    const plan = await createPlan({ group_id: group.id, name: 'P', session });
    await linkPlanToM365({ plan_id: plan.id, external_id: 'P-EXT-1', session });
    const systemSession: PlannerSessionScope = {
      ...session,
      actor: { kind: 'system', system_id: 'integrations.m365' },
    };
    return { seeded, plan, systemSession, userSession: session };
  }

  it('transitions sync_status idle → pulling and emits sync-status-changed', async () => {
    await withTestDb(HARNESS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { seeded, plan, systemSession } = await seedLinkedPlan(pool);
        await markPlanSyncStatus({ plan_id: plan.id, status: 'pulling', session: systemSession });

        const events = await readEvents(pool, seeded.tenant_id, 'planner.plan.sync-status-changed');
        expect(events).toHaveLength(1);
        // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
        const p = events[0]?.payload as any;
        expect(p.plan_id).toBe(plan.id);
        expect(p.before_status).toBe('idle');
        expect(p.after_status).toBe('pulling');
        expect(p.error).toBeNull();

        const row = await pool.query(
          'SELECT sync_status, last_error FROM planner.plans WHERE id = $1',
          [plan.id],
        );
        expect(row.rows[0].sync_status).toBe('pulling');
        expect(row.rows[0].last_error).toBeNull();
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('persists last_error when transitioning to error', async () => {
    await withTestDb(HARNESS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { plan, systemSession } = await seedLinkedPlan(pool);
        await markPlanSyncStatus({
          plan_id: plan.id,
          status: 'error',
          error: 'graph rate limited',
          session: systemSession,
        });
        const row = await pool.query(
          'SELECT sync_status, last_error FROM planner.plans WHERE id = $1',
          [plan.id],
        );
        expect(row.rows[0].sync_status).toBe('error');
        expect(row.rows[0].last_error).toBe('graph rate limited');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects RESERVED_FOR_SYSTEM_ACTOR when called from a human session', async () => {
    await withTestDb(HARNESS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { plan, userSession } = await seedLinkedPlan(pool);
        await expect(
          markPlanSyncStatus({ plan_id: plan.id, status: 'pulling', session: userSession }),
        ).rejects.toMatchObject({ code: 'RESERVED_FOR_SYSTEM_ACTOR' });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('is a no-op when before status + error already match', async () => {
    await withTestDb(HARNESS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { seeded, plan, systemSession } = await seedLinkedPlan(pool);
        // Both initial state idle, error null → no-op.
        const before = await countEvents(
          pool,
          seeded.tenant_id,
          'planner.plan.sync-status-changed',
        );
        await markPlanSyncStatus({ plan_id: plan.id, status: 'idle', session: systemSession });
        const after = await countEvents(pool, seeded.tenant_id, 'planner.plan.sync-status-changed');
        expect(after).toBe(before);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects with CHECK constraint violation on bogus status', async () => {
    await withTestDb(HARNESS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { plan, systemSession } = await seedLinkedPlan(pool);
        try {
          await markPlanSyncStatus({
            plan_id: plan.id,
            // biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
            status: 'bogus' as any,
            session: systemSession,
          });
          expect.fail('expected CHECK violation');
        } catch (err) {
          const chain: unknown[] = [err];
          let cur: unknown = err;
          while (cur && typeof cur === 'object' && 'cause' in cur) {
            cur = (cur as { cause?: unknown }).cause;
            if (cur) chain.push(cur);
          }
          const matched = chain.some(
            (e) =>
              typeof e === 'object' &&
              e !== null &&
              'constraint' in e &&
              (e as { constraint?: string }).constraint === 'plans_sync_status_check',
          );
          expect(matched, JSON.stringify(chain, null, 2)).toBe(true);
        }
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
