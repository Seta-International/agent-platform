import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createGroup, createLabel, createPlan, setCategoryDescriptions } from '../../src/index.ts';
import { countEvents, seedTenant } from '../helpers.ts';

describe('setCategoryDescriptions (batched)', () => {
  it('applies a label-only patch without touching the slot description', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;
          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Eng',
            session,
          });
          const plan = await createPlan({ group_id: group.id, name: 'P', session });
          const label = await createLabel({
            plan_id: plan.id,
            name: 'Bug',
            color: '#f00',
            session,
          });

          await setCategoryDescriptions({
            plan_id: plan.id,
            slots: { 4: { name: 'QA' } },
            session,
          });

          // Label-only patch: slot 4 already has "QA"; this attaches a label
          // but must not throw and must not clear/overwrite the description.
          const result = await setCategoryDescriptions({
            plan_id: plan.id,
            slots: { 4: { label_id: label.id } },
            session,
          });

          expect(result.category_descriptions.category4).toBe('QA');

          const [{ rows }] = [
            await pool.query(`SELECT category_slot FROM planner.labels WHERE id = $1`, [label.id]),
          ];
          expect(rows[0]?.category_slot).toBe(4);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('name=undefined leaves the description unchanged and emits no description-changed event', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;
          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Eng',
            session,
          });
          const plan = await createPlan({ group_id: group.id, name: 'P', session });
          const label = await createLabel({
            plan_id: plan.id,
            name: 'Bug',
            color: '#f00',
            session,
          });

          await setCategoryDescriptions({
            plan_id: plan.id,
            slots: { 7: { name: 'Backend' } },
            session,
          });

          const before = await countEvents(
            pool,
            seeded.tenant_id,
            'planner.plan.category-description-changed',
          );

          await setCategoryDescriptions({
            plan_id: plan.id,
            slots: { 7: { label_id: label.id } },
            session,
          });

          const after = await countEvents(
            pool,
            seeded.tenant_id,
            'planner.plan.category-description-changed',
          );
          expect(after).toBe(before);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('name=null clears the slot description', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;
          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Eng',
            session,
          });
          const plan = await createPlan({ group_id: group.id, name: 'P', session });

          await setCategoryDescriptions({
            plan_id: plan.id,
            slots: { 3: { name: 'Docs' } },
            session,
          });
          const cleared = await setCategoryDescriptions({
            plan_id: plan.id,
            slots: { 3: { name: null } },
            session,
          });
          expect(cleared.category_descriptions.category3).toBeUndefined();

          const { rows: events } = await pool.query<{
            payload: { before: string | null; after: string | null };
          }>(
            `SELECT payload FROM core.events
               WHERE tenant_id = $1 AND event_type = $2
               ORDER BY occurred_at ASC, payload->>'after' NULLS LAST`,
            [seeded.tenant_id, 'planner.plan.category-description-changed'],
          );
          const last = events[events.length - 1]?.payload;
          expect(last?.before).toBe('Docs');
          expect(last?.after).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('label_id=null detaches the label currently in that slot', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;
          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Eng',
            session,
          });
          const plan = await createPlan({ group_id: group.id, name: 'P', session });
          const label = await createLabel({
            plan_id: plan.id,
            name: 'Bug',
            color: '#f00',
            session,
          });

          await setCategoryDescriptions({
            plan_id: plan.id,
            slots: { 2: { name: 'Backend', label_id: label.id } },
            session,
          });

          await setCategoryDescriptions({
            plan_id: plan.id,
            slots: { 2: { label_id: null } },
            session,
          });

          const { rows } = await pool.query(
            `SELECT category_slot FROM planner.labels WHERE id = $1`,
            [label.id],
          );
          expect(rows[0]?.category_slot).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rolls back all per-slot writes when one slot in the batch throws', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;
          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Eng',
            session,
          });
          const plan = await createPlan({ group_id: group.id, name: 'P', session });

          await setCategoryDescriptions({
            plan_id: plan.id,
            slots: { 1: { name: 'Existing' } },
            session,
          });

          const beforeEvents = await countEvents(
            pool,
            seeded.tenant_id,
            'planner.plan.category-description-changed',
          );

          // Slot 1 has a valid update; slot 2's name exceeds the 100-char cap
          // and will throw inside the loop. The batched op must roll back
          // both — slot 1 should still read "Existing".
          const tooLong = 'x'.repeat(101);
          await expect(
            setCategoryDescriptions({
              plan_id: plan.id,
              slots: {
                1: { name: 'Updated' },
                2: { name: tooLong },
              },
              session,
            }),
          ).rejects.toThrow();

          const { rows } = await pool.query<{
            category_descriptions: Record<string, string>;
          }>(`SELECT category_descriptions FROM planner.plans WHERE id = $1`, [plan.id]);
          expect(rows[0]?.category_descriptions.category1).toBe('Existing');
          expect(rows[0]?.category_descriptions.category2).toBeUndefined();

          const afterEvents = await countEvents(
            pool,
            seeded.tenant_id,
            'planner.plan.category-description-changed',
          );
          expect(afterEvents).toBe(beforeEvents);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
