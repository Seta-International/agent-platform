import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createGroup, linkGroupToM365, unlinkGroupFromM365 } from '../../src/index.ts';
import { readEvents, seedTenant } from '../helpers.ts';

describe('unlinkGroupFromM365', () => {
  it('clears external_source/external_id and emits changed_fields', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const g = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'G',
            session: seeded.adminSession,
          });
          await linkGroupToM365({
            group_id: g.id,
            external_id: 'abc-123',
            session: seeded.adminSession,
          });
          const u = await unlinkGroupFromM365({
            group_id: g.id,
            session: seeded.adminSession,
          });
          expect(u.external_source).toBe('native');
          expect(u.external_id).toBeNull();
          expect(u.version).toBe(3);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.group.updated');
          expect(events).toHaveLength(2);
          const unlinkEvent = events.find((e) => {
            const p = e.payload as { version_before?: number };
            return p.version_before === 2;
          });
          expect(unlinkEvent).toBeDefined();
          const lastPayload = unlinkEvent?.payload as {
            changed_fields: string[];
            before: Record<string, unknown>;
            after: Record<string, unknown>;
          };
          expect(lastPayload.changed_fields).toEqual(
            expect.arrayContaining(['external_source', 'external_id']),
          );
          expect(lastPayload.before.external_source).toBe('m365');
          expect(lastPayload.before.external_id).toBe('abc-123');
          expect(lastPayload.after.external_source).toBe('native');
          expect(lastPayload.after.external_id).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rejects on already-native group with CONFLICT', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const g = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'G',
            session: seeded.adminSession,
          });
          await expect(
            unlinkGroupFromM365({ group_id: g.id, session: seeded.adminSession }),
          ).rejects.toMatchObject({ code: 'CONFLICT' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
