import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it, vi } from 'vitest';
import { getGroup } from '../../../src/backend/domain/get-group.ts';
import { resolveGroupConflict } from '../../../src/backend/domain/resolve-group-conflict.ts';
import { PlannerError } from '../../../src/backend/rbac.ts';
import { createGroup } from '../../../src/index.ts';
import { buildSession, seedTenant } from '../../helpers.ts';

const dbEnv = () => ({
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
});

describe('resolveGroupConflict', () => {
  it('rejects when no decisions provided', async () => {
    const tenantId = crypto.randomUUID();
    const session = buildSession({
      tenant_id: tenantId,
      user_id: crypto.randomUUID(),
      roles: ['org.admin'],
    });
    const getLink = vi.fn().mockResolvedValue({
      id: 'link-1',
      lastSyncedFields: {},
      externalId: 'ext-1',
      tenantId,
    });
    const setSyncStatus = vi.fn();
    const enqueueGroupPush = vi.fn();

    await expect(
      resolveGroupConflict(
        { group_id: crypto.randomUUID(), decisions: [], session },
        { getLink, setSyncStatus, enqueueGroupPush },
      ),
    ).rejects.toSatisfy((e: unknown) => e instanceof PlannerError && e.code === 'VALIDATION');
    expect(getLink).not.toHaveBeenCalled();
  });

  it('rejects when group is not linked', async () => {
    const session = buildSession({
      tenant_id: crypto.randomUUID(),
      user_id: crypto.randomUUID(),
      roles: ['org.admin'],
    });
    const getLink = vi.fn().mockResolvedValue(null);
    const setSyncStatus = vi.fn();
    const enqueueGroupPush = vi.fn();

    await expect(
      resolveGroupConflict(
        {
          group_id: crypto.randomUUID(),
          decisions: [{ field: 'name', choice: 'remote' }],
          session,
        },
        { getLink, setSyncStatus, enqueueGroupPush },
      ),
    ).rejects.toSatisfy((e: unknown) => e instanceof PlannerError && e.code === 'NOT_FOUND');
    expect(setSyncStatus).not.toHaveBeenCalled();
  });

  it('skips updateGroup for local choices and enqueues push instead', async () => {
    const tenantId = crypto.randomUUID();
    const session = buildSession({
      tenant_id: tenantId,
      user_id: crypto.randomUUID(),
      roles: ['org.admin'],
    });
    const linkId = crypto.randomUUID();
    const groupId = crypto.randomUUID();
    const getLink = vi.fn().mockResolvedValue({
      id: linkId,
      lastSyncedFields: { name: 'Remote Name' },
      externalId: 'ext-local',
      tenantId,
    });
    const setSyncStatus = vi.fn().mockResolvedValue(undefined);
    const enqueueGroupPush = vi.fn().mockResolvedValue(undefined);

    await resolveGroupConflict(
      {
        group_id: groupId,
        decisions: [{ field: 'name', choice: 'local' }],
        session,
      },
      { getLink, setSyncStatus, enqueueGroupPush },
    );

    expect(enqueueGroupPush).toHaveBeenCalledWith({
      tenant_id: tenantId,
      group_id: groupId,
      changed_fields: ['name'],
    });
    expect(setSyncStatus).toHaveBeenCalledWith(linkId, 'idle');
  });

  it('rejects when a remote decision requests a field not in the snapshot', async () => {
    const session = buildSession({
      tenant_id: crypto.randomUUID(),
      user_id: crypto.randomUUID(),
      roles: ['org.admin'],
    });
    const getLink = vi.fn().mockResolvedValue({
      id: 'link-x',
      lastSyncedFields: { description: 'some desc' },
      externalId: 'ext-x',
      tenantId: crypto.randomUUID(),
    });
    const setSyncStatus = vi.fn();
    const enqueueGroupPush = vi.fn();

    await expect(
      resolveGroupConflict(
        {
          group_id: crypto.randomUUID(),
          decisions: [{ field: 'name', choice: 'remote' }],
          session,
        },
        { getLink, setSyncStatus, enqueueGroupPush },
      ),
    ).rejects.toSatisfy((e: unknown) => e instanceof PlannerError && e.code === 'VALIDATION');
    expect(setSyncStatus).not.toHaveBeenCalled();
  });

  it('applies remote choices to the group via updateGroup and marks status idle', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;

        const group = await createGroup({
          tenant_id: seeded.tenant_id,
          name: 'Original Name',
          session,
        });

        const linkId = crypto.randomUUID();
        const setSyncStatus = vi.fn().mockResolvedValue(undefined);
        const enqueueGroupPush = vi.fn().mockResolvedValue(undefined);
        const getLink = vi.fn().mockResolvedValue({
          id: linkId,
          lastSyncedFields: { name: 'Remote Name' },
          externalId: 'ext-remote-ok',
          tenantId: seeded.tenant_id,
        });

        await resolveGroupConflict(
          {
            group_id: group.id,
            decisions: [{ field: 'name', choice: 'remote' }],
            session,
          },
          { getLink, setSyncStatus, enqueueGroupPush },
        );

        expect(setSyncStatus).toHaveBeenCalledWith(linkId, 'idle');
        expect(enqueueGroupPush).not.toHaveBeenCalled();

        const updated = await getGroup({ group_id: group.id, session });
        expect(updated.name).toBe('Remote Name');
        expect(updated.version).toBe(2);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
