import { describe, expect, it } from 'vitest';
import {
  createM365PlanLinkRepo,
  createM365ResourceEtagRepo,
} from '../../src/backend/m365/plans/repo.ts';
import { withIntegrationsTestDb } from '../helpers/test-db.ts';

describe('m365_resource_etags migration', () => {
  it('creates table with correct column order', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      const { rows } = await pool.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'integrations'
          AND table_name = 'm365_resource_etags'
        ORDER BY ordinal_position
      `);
      const names = rows.map((r) => r.column_name);
      expect(names).toEqual([
        'id',
        'tenant_id',
        'plan_link_id',
        'resource_type',
        'platform_id',
        'external_id',
        'etag',
        'last_synced_fields',
        'updated_at',
      ]);
    });
  });

  it('has at least one FK constraint', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      const { rows } = await pool.query<{ conname: string }>(`
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'integrations'
          AND t.relname = 'm365_resource_etags'
          AND c.contype = 'f'
      `);
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('m365_plan_links migration', () => {
  it('creates table with correct column order', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      const { rows } = await pool.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'integrations'
          AND table_name = 'm365_plan_links'
        ORDER BY ordinal_position
      `);
      const names = rows.map((r) => r.column_name);
      expect(names).toEqual([
        'id',
        'tenant_id',
        'group_id',
        'plan_id',
        'external_id',
        'last_synced_at',
        'last_synced_snapshot',
        'sync_status',
        'last_error',
        'last_reconcile_at',
        'unlinked_at',
        'created_at',
        'updated_at',
      ]);
    });
  });

  it('has the correct partial unique and regular indexes', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      const { rows } = await pool.query<{ indexname: string }>(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'integrations'
          AND tablename = 'm365_plan_links'
      `);
      const indexNames = rows.map((r) => r.indexname);
      expect(indexNames).toContain('m365_plan_links_uniq_plan_live');
      expect(indexNames).toContain('m365_plan_links_uniq_external_live');
      expect(indexNames).toContain('m365_plan_links_by_group_live');
    });
  });
});

describe('createM365PlanLinkRepo', () => {
  it('upsert + findByPlan + findByExternal + setSyncStatus + persistSnapshot + tombstone', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createM365PlanLinkRepo({ db });

      const link = await repo.upsert({
        tenantId: '11111111-1111-1111-1111-111111111111',
        groupId: '22222222-2222-2222-2222-222222222222',
        planId: '33333333-3333-3333-3333-333333333333',
        externalId: 'P-EXT-1',
        initialSnapshot: {},
      });
      expect(link.syncStatus).toBe('idle');

      expect((await repo.findByPlan('33333333-3333-3333-3333-333333333333'))?.id).toBe(link.id);
      expect((await repo.findByExternal(link.tenantId, 'P-EXT-1'))?.id).toBe(link.id);

      await repo.setSyncStatus(link.id, 'pulling');
      expect((await repo.findByPlan('33333333-3333-3333-3333-333333333333'))?.syncStatus).toBe(
        'pulling',
      );

      await repo.setSyncStatus(link.id, 'error', 'graph 500');
      expect((await repo.findByPlan('33333333-3333-3333-3333-333333333333'))?.lastError).toBe(
        'graph 500',
      );

      await repo.persistSnapshot(link.id, { foo: 'bar' });
      const reloaded = await repo.findByPlan('33333333-3333-3333-3333-333333333333');
      expect(reloaded?.lastSyncedSnapshot).toEqual({ foo: 'bar' });

      await repo.tombstone(link.id);
      expect(await repo.findByPlan('33333333-3333-3333-3333-333333333333')).toBeNull();
    });
  });

  it('listByGroup returns multiple links', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createM365PlanLinkRepo({ db });

      const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const groupId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

      await repo.upsert({
        tenantId,
        groupId,
        planId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        externalId: 'P-EXT-A',
        initialSnapshot: {},
      });
      await repo.upsert({
        tenantId,
        groupId,
        planId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        externalId: 'P-EXT-B',
        initialSnapshot: {},
      });

      const links = await repo.listByGroup(tenantId, groupId);
      expect(links.length).toBe(2);
      const extIds = links.map((l) => l.externalId).sort();
      expect(extIds).toEqual(['P-EXT-A', 'P-EXT-B']);
    });
  });

  it('re-upsert after tombstone creates a new live row', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createM365PlanLinkRepo({ db });

      const tenantId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
      const groupId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
      const planId = '00000000-0000-0000-0000-000000000001';

      const original = await repo.upsert({
        tenantId,
        groupId,
        planId,
        externalId: 'P-EXT-ORIG',
        initialSnapshot: {},
      });

      await repo.tombstone(original.id);
      expect(await repo.findByPlan(planId)).toBeNull();

      const relinked = await repo.upsert({
        tenantId,
        groupId,
        planId,
        externalId: 'P-EXT-NEW',
        initialSnapshot: {},
      });

      expect(relinked.id).not.toBe(original.id);
      const live = await repo.findByPlan(planId);
      expect(live?.id).toBe(relinked.id);
      expect(live?.externalId).toBe('P-EXT-NEW');
    });
  });
});

describe('createM365ResourceEtagRepo', () => {
  it('upsert + get + listForLink + remove', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const planRepo = createM365PlanLinkRepo({ db });
      const etagRepo = createM365ResourceEtagRepo({ db });

      const tenantId = '11111111-1111-1111-1111-111111111112';
      const link = await planRepo.upsert({
        tenantId,
        groupId: '22222222-2222-2222-2222-222222222223',
        planId: '33333333-3333-3333-3333-333333333334',
        externalId: 'P-ETAG-1',
        initialSnapshot: {},
      });

      await etagRepo.upsert({
        tenantId,
        planLinkId: link.id,
        resourceType: 'task',
        setaId: 'seta-task-1',
        externalId: 'ext-task-1',
        etag: 'W/"etag-1"',
        lastSyncedFields: { title: 'My Task' },
      });

      const row = await etagRepo.get(link.id, 'task', 'seta-task-1');
      expect(row).not.toBeNull();
      expect(row?.etag).toBe('W/"etag-1"');
      expect(row?.lastSyncedFields).toEqual({ title: 'My Task' });

      // upsert updates etag
      await etagRepo.upsert({
        tenantId,
        planLinkId: link.id,
        resourceType: 'task',
        setaId: 'seta-task-1',
        externalId: 'ext-task-1',
        etag: 'W/"etag-2"',
        lastSyncedFields: { title: 'Updated Task' },
      });
      const updated = await etagRepo.get(link.id, 'task', 'seta-task-1');
      expect(updated?.etag).toBe('W/"etag-2"');

      // listForLink without filter returns all
      await etagRepo.upsert({
        tenantId,
        planLinkId: link.id,
        resourceType: 'bucket',
        setaId: 'seta-bucket-1',
        externalId: 'ext-bucket-1',
        etag: 'W/"etag-b"',
        lastSyncedFields: {},
      });
      const all = await etagRepo.listForLink(link.id);
      expect(all.length).toBe(2);

      // listForLink with resourceType filter
      const tasks = await etagRepo.listForLink(link.id, 'task');
      expect(tasks.length).toBe(1);
      expect(tasks[0]?.resourceType).toBe('task');

      // remove deletes the row
      await etagRepo.remove(link.id, 'task', 'seta-task-1');
      expect(await etagRepo.get(link.id, 'task', 'seta-task-1')).toBeNull();
      const remaining = await etagRepo.listForLink(link.id);
      expect(remaining.length).toBe(1);
    });
  });
});
