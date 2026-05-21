import { describe, expect, it } from 'vitest';
import { createM365GroupLinkRepo } from '../../src/m365/repo.ts';
import { withIntegrationsTestDb } from '../helpers/test-db.ts';

describe('m365GroupLinkRepo CRUD round-trip', () => {
  it('findByGroup returns null when no link exists', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createM365GroupLinkRepo({ db });
      const result = await repo.findByGroup(crypto.randomUUID());
      expect(result).toBeNull();
    });
  });

  it('upsert creates a row when none exists', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createM365GroupLinkRepo({ db });
      const tenantId = crypto.randomUUID();
      const groupId = crypto.randomUUID();

      const row = await repo.upsert({
        tenantId,
        groupId,
        externalId: 'ext-001',
        lastSyncedFields: { name: 'Engineering' },
      });

      expect(row.tenantId).toBe(tenantId);
      expect(row.groupId).toBe(groupId);
      expect(row.externalId).toBe('ext-001');
      expect(row.syncStatus).toBe('idle');
      expect(row.unlinkedAt).toBeNull();
    });
  });

  it('upsert updates existing row — same (tenant_id, group_id), no duplicates', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createM365GroupLinkRepo({ db });
      const tenantId = crypto.randomUUID();
      const groupId = crypto.randomUUID();

      await repo.upsert({
        tenantId,
        groupId,
        externalId: 'ext-001',
        lastSyncedFields: { name: 'Old Name' },
      });
      const updated = await repo.upsert({
        tenantId,
        groupId,
        externalId: 'ext-002',
        lastSyncedFields: { name: 'New Name' },
      });

      expect(updated.externalId).toBe('ext-002');
      expect(updated.lastSyncedFields).toEqual({ name: 'New Name' });

      // Only one live row should exist
      const found = await repo.findByGroup(groupId);
      expect(found).not.toBeNull();
      expect(found?.externalId).toBe('ext-002');
    });
  });

  it('findByGroup returns the row after upsert', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createM365GroupLinkRepo({ db });
      const tenantId = crypto.randomUUID();
      const groupId = crypto.randomUUID();

      await repo.upsert({
        tenantId,
        groupId,
        externalId: 'ext-abc',
        lastSyncedFields: { name: 'Sales' },
      });

      const row = await repo.findByGroup(groupId);
      expect(row).not.toBeNull();
      expect(row?.groupId).toBe(groupId);
      expect(row?.tenantId).toBe(tenantId);
    });
  });

  it('findByExternal returns the row via (tenant_id, external_id)', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createM365GroupLinkRepo({ db });
      const tenantId = crypto.randomUUID();
      const groupId = crypto.randomUUID();

      await repo.upsert({
        tenantId,
        groupId,
        externalId: 'ext-xyz',
        lastSyncedFields: { name: 'HR' },
      });

      const row = await repo.findByExternal(tenantId, 'ext-xyz');
      expect(row).not.toBeNull();
      expect(row?.groupId).toBe(groupId);
    });
  });

  it("setSyncStatus('pulling') then setSyncStatus('idle') round-trips", async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createM365GroupLinkRepo({ db });
      const row = await repo.upsert({
        tenantId: crypto.randomUUID(),
        groupId: crypto.randomUUID(),
        externalId: 'ext-st1',
        lastSyncedFields: {},
      });

      await repo.setSyncStatus(row.id, 'pulling');
      const afterPulling = await repo.findByGroup(row.groupId);
      expect(afterPulling?.syncStatus).toBe('pulling');

      await repo.setSyncStatus(row.id, 'idle');
      const afterIdle = await repo.findByGroup(row.groupId);
      expect(afterIdle?.syncStatus).toBe('idle');
      expect(afterIdle?.lastError).toBeNull();
    });
  });

  it("setSyncStatus('error', 'some msg') persists the error string", async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createM365GroupLinkRepo({ db });
      const row = await repo.upsert({
        tenantId: crypto.randomUUID(),
        groupId: crypto.randomUUID(),
        externalId: 'ext-err',
        lastSyncedFields: {},
      });

      await repo.setSyncStatus(row.id, 'error', 'some msg');
      const found = await repo.findByGroup(row.groupId);
      expect(found?.syncStatus).toBe('error');
      expect(found?.lastError).toBe('some msg');
    });
  });

  it('persistDeltaLink updates row, sets syncStatus to idle, clears lastError', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createM365GroupLinkRepo({ db });
      const row = await repo.upsert({
        tenantId: crypto.randomUUID(),
        groupId: crypto.randomUUID(),
        externalId: 'ext-dl',
        lastSyncedFields: {},
      });

      // Put it into error state first
      await repo.setSyncStatus(row.id, 'error', 'prior error');

      await repo.persistDeltaLink(row.id, '<delta-token>', { name: 'x', members: 3 });
      const found = await repo.findByGroup(row.groupId);
      expect(found?.deltaLink).toBe('<delta-token>');
      expect(found?.lastSyncedFields).toEqual({ name: 'x', members: 3 });
      expect(found?.syncStatus).toBe('idle');
      expect(found?.lastError).toBeNull();
      expect(found?.lastSyncedAt).toBeInstanceOf(Date);
    });
  });

  it('tombstone sets unlinkedAt; subsequent findByGroup returns null', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createM365GroupLinkRepo({ db });
      const groupId = crypto.randomUUID();
      const row = await repo.upsert({
        tenantId: crypto.randomUUID(),
        groupId,
        externalId: 'ext-tomb',
        lastSyncedFields: {},
      });

      await repo.tombstone(row.id);
      const found = await repo.findByGroup(groupId);
      expect(found).toBeNull();
    });
  });

  it('after tombstone, a new upsert with same (tenant_id, group_id) creates a fresh row', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createM365GroupLinkRepo({ db });
      const tenantId = crypto.randomUUID();
      const groupId = crypto.randomUUID();

      const first = await repo.upsert({
        tenantId,
        groupId,
        externalId: 'ext-first',
        lastSyncedFields: {},
      });

      await repo.tombstone(first.id);

      const second = await repo.upsert({
        tenantId,
        groupId,
        externalId: 'ext-second',
        lastSyncedFields: { name: 'Renewed' },
      });

      // Distinct row with a new id
      expect(second.id).not.toBe(first.id);
      expect(second.externalId).toBe('ext-second');
      expect(second.unlinkedAt).toBeNull();

      // findByGroup returns the new live row
      const found = await repo.findByGroup(groupId);
      expect(found?.id).toBe(second.id);
    });
  });
});
