import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';
import type * as schema from '../../src/backend/db/schema/index.ts';
import { m365PlanLinks } from '../../src/backend/db/schema/index.ts';
import {
  createM365PlanLinkRepo,
  createM365ResourceEtagRepo,
} from '../../src/backend/m365/plans/repo.ts';
import { withIntegrationsTestDb } from '../helpers/test-db.ts';

const TENANT = '11111111-1111-1111-1111-111111111111';
const GROUP = '22222222-2222-2222-2222-222222222222';
const PLAN = '33333333-3333-3333-3333-333333333333';

async function seedLink(db: NodePgDatabase<typeof schema>): Promise<string> {
  const planRepo = createM365PlanLinkRepo({ db });
  const link = await planRepo.upsert({
    tenantId: TENANT,
    groupId: GROUP,
    planId: PLAN,
    externalId: 'P-EXT-1',
    initialSnapshot: {},
  });
  return link.id;
}

describe('createM365ResourceEtagRepo', () => {
  it('upsert then get returns the row', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const planLinkId = await seedLink(db);
      const etagRepo = createM365ResourceEtagRepo({ db });

      await etagRepo.upsert({
        tenantId: TENANT,
        planLinkId,
        resourceType: 'task',
        setaId: 'TASK-1',
        externalId: 'EXT-TASK-1',
        etag: 'W/"1"',
        lastSyncedFields: { title: 'A' },
      });

      const row = await etagRepo.get(planLinkId, 'task', 'TASK-1');
      expect(row?.etag).toBe('W/"1"');
      expect(row?.lastSyncedFields).toEqual({ title: 'A' });
    });
  });

  it('upsert with same key updates etag + lastSyncedFields + updatedAt', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const planLinkId = await seedLink(db);
      const etagRepo = createM365ResourceEtagRepo({ db });

      await etagRepo.upsert({
        tenantId: TENANT,
        planLinkId,
        resourceType: 'task',
        setaId: 'TASK-1',
        externalId: 'EXT-TASK-1',
        etag: 'W/"1"',
        lastSyncedFields: { title: 'A' },
      });
      const first = await etagRepo.get(planLinkId, 'task', 'TASK-1');
      const firstUpdatedAt = first!.updatedAt;

      // Ensure at least 1ms passes so updatedAt strictly advances
      await new Promise((r) => setTimeout(r, 2));

      await etagRepo.upsert({
        tenantId: TENANT,
        planLinkId,
        resourceType: 'task',
        setaId: 'TASK-1',
        externalId: 'EXT-TASK-1',
        etag: 'W/"2"',
        lastSyncedFields: { title: 'B' },
      });

      const second = await etagRepo.get(planLinkId, 'task', 'TASK-1');
      expect(second?.etag).toBe('W/"2"');
      expect(second?.lastSyncedFields).toEqual({ title: 'B' });
      expect(second!.updatedAt.getTime()).toBeGreaterThan(firstUpdatedAt.getTime());
    });
  });

  it('listForLink without resourceType returns all rows for the link', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const planLinkId = await seedLink(db);
      const etagRepo = createM365ResourceEtagRepo({ db });

      await etagRepo.upsert({
        tenantId: TENANT,
        planLinkId,
        resourceType: 'task',
        setaId: 'TASK-1',
        externalId: 'EXT-TASK-1',
        etag: 'W/"1"',
        lastSyncedFields: {},
      });
      await etagRepo.upsert({
        tenantId: TENANT,
        planLinkId,
        resourceType: 'task',
        setaId: 'TASK-2',
        externalId: 'EXT-TASK-2',
        etag: 'W/"2"',
        lastSyncedFields: {},
      });
      await etagRepo.upsert({
        tenantId: TENANT,
        planLinkId,
        resourceType: 'bucket',
        setaId: 'BUCKET-1',
        externalId: 'EXT-BUCKET-1',
        etag: 'W/"3"',
        lastSyncedFields: {},
      });

      const all = await etagRepo.listForLink(planLinkId);
      expect(all.length).toBe(3);
    });
  });

  it('listForLink with resourceType filter returns only that subset', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const planLinkId = await seedLink(db);
      const etagRepo = createM365ResourceEtagRepo({ db });

      await etagRepo.upsert({
        tenantId: TENANT,
        planLinkId,
        resourceType: 'task',
        setaId: 'TASK-1',
        externalId: 'EXT-TASK-1',
        etag: 'W/"1"',
        lastSyncedFields: {},
      });
      await etagRepo.upsert({
        tenantId: TENANT,
        planLinkId,
        resourceType: 'task',
        setaId: 'TASK-2',
        externalId: 'EXT-TASK-2',
        etag: 'W/"2"',
        lastSyncedFields: {},
      });
      await etagRepo.upsert({
        tenantId: TENANT,
        planLinkId,
        resourceType: 'bucket',
        setaId: 'BUCKET-1',
        externalId: 'EXT-BUCKET-1',
        etag: 'W/"3"',
        lastSyncedFields: {},
      });

      const tasks = await etagRepo.listForLink(planLinkId, 'task');
      expect(tasks.length).toBe(2);
      expect(tasks.every((r) => r.resourceType === 'task')).toBe(true);

      const buckets = await etagRepo.listForLink(planLinkId, 'bucket');
      expect(buckets.length).toBe(1);
      expect(buckets[0]?.resourceType).toBe('bucket');

      const taskDetails = await etagRepo.listForLink(planLinkId, 'taskDetails');
      expect(taskDetails.length).toBe(0);
    });
  });

  it('remove deletes the matching row and leaves others intact', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const planLinkId = await seedLink(db);
      const etagRepo = createM365ResourceEtagRepo({ db });

      await etagRepo.upsert({
        tenantId: TENANT,
        planLinkId,
        resourceType: 'task',
        setaId: 'TASK-1',
        externalId: 'EXT-TASK-1',
        etag: 'W/"1"',
        lastSyncedFields: {},
      });
      await etagRepo.upsert({
        tenantId: TENANT,
        planLinkId,
        resourceType: 'task',
        setaId: 'TASK-2',
        externalId: 'EXT-TASK-2',
        etag: 'W/"2"',
        lastSyncedFields: {},
      });

      await etagRepo.remove(planLinkId, 'task', 'TASK-1');

      expect(await etagRepo.get(planLinkId, 'task', 'TASK-1')).toBeNull();

      // TASK-2 on the same planLinkId must still be present
      const remaining = await etagRepo.listForLink(planLinkId);
      expect(remaining.length).toBe(1);
      expect(remaining[0]?.setaId).toBe('TASK-2');
    });
  });

  it('tombstone (soft delete) does NOT cascade etag rows', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const planLinkId = await seedLink(db);
      const etagRepo = createM365ResourceEtagRepo({ db });
      const planRepo = createM365PlanLinkRepo({ db });

      await etagRepo.upsert({
        tenantId: TENANT,
        planLinkId,
        resourceType: 'task',
        setaId: 'TASK-1',
        externalId: 'EXT-TASK-1',
        etag: 'W/"1"',
        lastSyncedFields: {},
      });

      await planRepo.tombstone(planLinkId);

      // Soft delete (unlinked_at set) keeps the FK row alive — etag must still exist
      const row = await etagRepo.get(planLinkId, 'task', 'TASK-1');
      expect(row).not.toBeNull();
      expect(row?.etag).toBe('W/"1"');
    });
  });

  it('hard delete of plan link cascades etag rows', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const planLinkId = await seedLink(db);
      const etagRepo = createM365ResourceEtagRepo({ db });

      await etagRepo.upsert({
        tenantId: TENANT,
        planLinkId,
        resourceType: 'task',
        setaId: 'TASK-1',
        externalId: 'EXT-TASK-1',
        etag: 'W/"1"',
        lastSyncedFields: {},
      });

      // Hard delete the parent to exercise ON DELETE CASCADE
      await db.delete(m365PlanLinks).where(eq(m365PlanLinks.id, planLinkId));

      expect(await etagRepo.get(planLinkId, 'task', 'TASK-1')).toBeNull();
    });
  });
});
