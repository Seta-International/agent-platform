import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createGroup, linkGroupToM365 } from '../../src/index.ts';
import { readEvents, seedTenant } from '../helpers.ts';

describe('linkGroupToM365', () => {
  it('sets external_source/external_id, bumps version, emits updated with changed_fields', async () => {
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
          const u = await linkGroupToM365({
            group_id: g.id,
            external_id: '00000000-0000-0000-0000-aaaaaaaaaaaa',
            session: seeded.adminSession,
          });
          expect(u.external_source).toBe('m365');
          expect(u.external_id).toBe('00000000-0000-0000-0000-aaaaaaaaaaaa');
          expect(u.version).toBe(2);
          const ev = await readEvents(pool, seeded.tenant_id, 'planner.group.updated');
          expect(ev).toHaveLength(1);
          const p = ev[0]?.payload as {
            changed_fields: string[];
            before: Record<string, unknown>;
            after: Record<string, unknown>;
            version_before: number;
            version_after: number;
          };
          expect(p.changed_fields).toEqual(
            expect.arrayContaining(['external_source', 'external_id']),
          );
          expect(p.before.external_source).toBe('native');
          expect(p.before.external_id).toBeNull();
          expect(p.after.external_source).toBe('m365');
          expect(p.after.external_id).toBe('00000000-0000-0000-0000-aaaaaaaaaaaa');
          expect(p.version_before).toBe(1);
          expect(p.version_after).toBe(2);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rejects second link to same external_id with LINKED_DUPLICATE', async () => {
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
          const g1 = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'G1',
            session: seeded.adminSession,
          });
          const g2 = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'G2',
            session: seeded.adminSession,
          });
          const ext = '00000000-0000-0000-0000-bbbbbbbbbbbb';
          await linkGroupToM365({
            group_id: g1.id,
            external_id: ext,
            session: seeded.adminSession,
          });
          await expect(
            linkGroupToM365({
              group_id: g2.id,
              external_id: ext,
              session: seeded.adminSession,
            }),
          ).rejects.toMatchObject({ code: 'LINKED_DUPLICATE' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rejects with CONFLICT when group is already linked', async () => {
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
            external_id: 'first-id',
            session: seeded.adminSession,
          });
          await expect(
            linkGroupToM365({
              group_id: g.id,
              external_id: 'second-id',
              session: seeded.adminSession,
            }),
          ).rejects.toMatchObject({ code: 'CONFLICT' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
