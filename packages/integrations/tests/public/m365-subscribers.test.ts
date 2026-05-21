/**
 * Integration tests for the M365 event subscribers.
 *
 * Handlers are invoked directly (not via the dispatcher loop) to keep tests
 * focused on handler logic. A real testcontainer Postgres is used so that
 * repo lookups and graphile_worker.add_job execute against a live schema.
 *
 * graphile-worker's schema is installed per-test-db via makeWorkerUtils so
 * that job row presence can be verified in graphile_worker._private_jobs.
 */
import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { makeWorkerUtils } from 'graphile-worker';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { resetIntegrationsDb } from '../../src/db/client.ts';
import { createM365GroupLinkRepo } from '../../src/m365/repo.ts';
import { buildM365Subscribers } from '../../src/m365/subscribers.ts';

// ── System actor sentinels (from system-session.ts) ──────────────────────────
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

// ── Shared test plumbing ──────────────────────────────────────────────────────

async function seedTenantAndGroup(pool: Pool) {
  const tenantId = crypto.randomUUID();
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Test', $2)`, [
    tenantId,
    `t-${tenantId.slice(0, 8)}`,
  ]);
  const groupId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO planner.groups (id, tenant_id, name, external_source, external_id, created_by)
     VALUES ($1, $2, 'Eng', 'm365', 'ext-sub-test', $3)`,
    [groupId, tenantId, SYSTEM_USER_ID],
  );
  return { tenantId, groupId };
}

/** Installs graphile_worker schema into the given pool so add_job SQL works. */
async function installWorkerSchema(pool: Pool): Promise<void> {
  const utils = await makeWorkerUtils({ pgPool: pool });
  await utils.migrate();
  await utils.release();
}

/** Builds a minimal DomainEvent for planner.group.updated. */
function makeGroupUpdatedEvent(opts: {
  tenantId: string;
  groupId: string;
  changedFields: string[];
  actorType?: 'user' | 'system';
}) {
  const actor =
    opts.actorType === 'system'
      ? { type: 'system' as const, user_id: null as null, system_id: 'integrations.m365' as const }
      : { type: 'user' as const, user_id: SYSTEM_USER_ID };
  return {
    id: crypto.randomUUID(),
    occurredAt: new Date(),
    tenantId: opts.tenantId,
    aggregateType: 'planner.group',
    aggregateId: opts.groupId,
    eventType: 'planner.group.updated',
    eventVersion: 1 as const,
    payload: {
      actor,
      group_id: opts.groupId,
      before: {},
      after: {},
      changed_fields: opts.changedFields,
      version_before: 1,
      version_after: 2,
    },
  };
}

function makeGroupDeletedEvent(opts: { tenantId: string; groupId: string }) {
  return {
    id: crypto.randomUUID(),
    occurredAt: new Date(),
    tenantId: opts.tenantId,
    aggregateType: 'planner.group',
    aggregateId: opts.groupId,
    eventType: 'planner.group.deleted',
    eventVersion: 1 as const,
    payload: {
      actor: { type: 'user' as const, user_id: SYSTEM_USER_ID },
      group_id: opts.groupId,
      version_before: 1,
      deleted_at: new Date().toISOString(),
    },
  };
}

function makeMemberRoleChangedEvent(opts: {
  tenantId: string;
  groupId: string;
  actorType?: 'user' | 'system';
}) {
  const actor =
    opts.actorType === 'system'
      ? { type: 'system' as const, user_id: null as null, system_id: 'integrations.m365' as const }
      : { type: 'user' as const, user_id: SYSTEM_USER_ID };
  return {
    id: crypto.randomUUID(),
    occurredAt: new Date(),
    tenantId: opts.tenantId,
    aggregateType: 'planner.group',
    aggregateId: opts.groupId,
    eventType: 'planner.group.member.role-changed',
    eventVersion: 1 as const,
    payload: {
      actor,
      group_id: opts.groupId,
      user_id: crypto.randomUUID(),
      before_role: 'member' as const,
      after_role: 'owner' as const,
    },
  };
}

/** Returns task identifier values of all pending graphile_worker jobs. */
async function getJobIdentifiers(pool: Pool): Promise<string[]> {
  const { rows } = await pool.query(`
    SELECT t.identifier
    FROM graphile_worker._private_jobs j
    JOIN graphile_worker._private_tasks t ON t.id = j.task_id
    ORDER BY j.id
  `);
  return rows.map((r: { identifier: string }) => r.identifier);
}

async function withSetup<T>(
  fn: (ctx: {
    pool: Pool;
    tenantId: string;
    groupId: string;
    repo: ReturnType<typeof createM365GroupLinkRepo>;
    // drizzle db backed by the test pool — schemaFilter not enforced at runtime
    db: NodePgDatabase<Record<string, never>>;
  }) => Promise<T>,
) {
  return withTestDb(
    {
      templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.SETA_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIntegrationsDb();
      initPools({ databaseUrl });
      try {
        await installWorkerSchema(pool);
        const { tenantId, groupId } = await seedTenantAndGroup(pool);
        const db = drizzle(pool, { schema: {} });
        const repo = createM365GroupLinkRepo({
          // db typed as never: drizzle() generic differs from NodePgDatabase<schema> but is
          // structurally compatible for the repo's select/update operations.
          db: db as never,
        });
        return await fn({ pool, tenantId, groupId, repo, db });
      } finally {
        resetCoreDb();
        resetIntegrationsDb();
        await closePools();
      }
    },
  );
}

// ── Subscriber refs ───────────────────────────────────────────────────────────

const subs = buildM365Subscribers();
const groupUpdatedSub = subs.find((s) => s.event === 'planner.group.updated')!;
const groupDeletedSub = subs.find((s) => s.event === 'planner.group.deleted')!;
const roleChangedSub = subs.find((s) => s.event === 'planner.group.member.role-changed')!;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('M365 event subscribers', () => {
  describe('planner.group.updated', () => {
    it('linked group + relevant changed_fields → push job enqueued', async () => {
      await withSetup(async ({ pool, tenantId, groupId, repo, db }) => {
        await repo.upsert({ tenantId, groupId, externalId: 'ext-sub-test', lastSyncedFields: {} });

        const event = makeGroupUpdatedEvent({ tenantId, groupId, changedFields: ['name'] });

        // Run handler inside a real drizzle transaction so ctx.tx.execute works.
        await db.transaction(async (tx) => groupUpdatedSub.handler(event, { tx: tx as never }));

        const identifiers = await getJobIdentifiers(pool);
        expect(identifiers).toContain('m365.group.push');
      });
    });

    it('linked group + only sync-related changed_fields → NO push job', async () => {
      await withSetup(async ({ pool, tenantId, groupId, repo, db }) => {
        await repo.upsert({ tenantId, groupId, externalId: 'ext-sub-test', lastSyncedFields: {} });

        const event = makeGroupUpdatedEvent({
          tenantId,
          groupId,
          changedFields: ['external_source', 'external_id'],
        });

        await db.transaction(async (tx) => groupUpdatedSub.handler(event, { tx: tx as never }));

        const identifiers = await getJobIdentifiers(pool);
        expect(identifiers).not.toContain('m365.group.push');
      });
    });

    it('unlinked group → NO push job (early return)', async () => {
      await withSetup(async ({ pool, tenantId, groupId, db }) => {
        // No link row seeded

        const event = makeGroupUpdatedEvent({ tenantId, groupId, changedFields: ['name'] });

        await db.transaction(async (tx) => groupUpdatedSub.handler(event, { tx: tx as never }));

        const identifiers = await getJobIdentifiers(pool);
        expect(identifiers).not.toContain('m365.group.push');
      });
    });

    it('system (M365 sync) actor → NO push job (loop prevention)', async () => {
      await withSetup(async ({ pool, tenantId, groupId, repo, db }) => {
        await repo.upsert({ tenantId, groupId, externalId: 'ext-sub-test', lastSyncedFields: {} });

        const event = makeGroupUpdatedEvent({
          tenantId,
          groupId,
          changedFields: ['name'],
          actorType: 'system',
        });

        await db.transaction(async (tx) => groupUpdatedSub.handler(event, { tx: tx as never }));

        const identifiers = await getJobIdentifiers(pool);
        expect(identifiers).not.toContain('m365.group.push');
      });
    });
  });

  describe('planner.group.deleted', () => {
    it('linked group → link tombstoned, NO push job enqueued', async () => {
      await withSetup(async ({ pool, tenantId, groupId, repo, db }) => {
        await repo.upsert({ tenantId, groupId, externalId: 'ext-sub-test', lastSyncedFields: {} });

        const event = makeGroupDeletedEvent({ tenantId, groupId });

        await db.transaction(async (tx) => groupDeletedSub.handler(event, { tx: tx as never }));

        const { rows } = await pool.query(
          `SELECT unlinked_at FROM integrations.m365_group_links WHERE group_id = $1`,
          [groupId],
        );
        expect(rows[0].unlinked_at).not.toBeNull();

        const identifiers = await getJobIdentifiers(pool);
        expect(identifiers).not.toContain('m365.group.push');
      });
    });
  });

  describe('planner.group.member.role-changed', () => {
    it('linked group → push job enqueued with changed_fields=[members]', async () => {
      await withSetup(async ({ pool, tenantId, groupId, repo, db }) => {
        await repo.upsert({ tenantId, groupId, externalId: 'ext-sub-test', lastSyncedFields: {} });

        const event = makeMemberRoleChangedEvent({ tenantId, groupId });

        await db.transaction(async (tx) => roleChangedSub.handler(event, { tx: tx as never }));

        const { rows } = await pool.query(`
          SELECT j.payload
          FROM graphile_worker._private_jobs j
          JOIN graphile_worker._private_tasks t ON t.id = j.task_id
          WHERE t.identifier = 'm365.group.push'
        `);
        expect(rows).toHaveLength(1);
        expect(rows[0].payload.changed_fields).toEqual(['members']);
        expect(rows[0].payload.group_id).toBe(groupId);
      });
    });

    it('system (M365 sync) actor → NO push job (loop prevention)', async () => {
      await withSetup(async ({ pool, tenantId, groupId, repo, db }) => {
        await repo.upsert({ tenantId, groupId, externalId: 'ext-sub-test', lastSyncedFields: {} });

        const event = makeMemberRoleChangedEvent({ tenantId, groupId, actorType: 'system' });

        await db.transaction(async (tx) => roleChangedSub.handler(event, { tx: tx as never }));

        const identifiers = await getJobIdentifiers(pool);
        expect(identifiers).not.toContain('m365.group.push');
      });
    });
  });
});
