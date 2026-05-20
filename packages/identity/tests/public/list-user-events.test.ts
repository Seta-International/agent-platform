import { resetCoreDb } from '@seta/core/internal/test-support';
import {
  changeUserEmail,
  createUser,
  deactivateUser,
  grantRole,
  listUserEvents,
  resetUserPasswordByAdmin,
} from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';

const CLI_ACTOR = { type: 'cli' as const, user_id: null };

async function seed(pool: import('pg').Pool): Promise<{
  tenantId: string;
  adminId: string;
  subjectId: string;
}> {
  const tenantId = crypto.randomUUID();
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'T', $2)`, [
    tenantId,
    `t-${tenantId.slice(0, 8)}`,
  ]);
  const { user_id: adminId } = await createUser(
    {
      tenant_id: tenantId,
      email: 'admin@t.local',
      name: 'Admin',
      password: 'admin-password-1234',
      initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
    },
    CLI_ACTOR,
  );
  const { user_id: subjectId } = await createUser(
    {
      tenant_id: tenantId,
      email: 'subject@t.local',
      name: 'Subject',
      password: 'subject-password-1234',
    },
    CLI_ACTOR,
  );
  return { tenantId, adminId, subjectId };
}

describe('@seta/identity listUserEvents', () => {
  it('role=actor returns events where the admin actor matches', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const { tenantId, adminId, subjectId } = await seed(pool);
          await grantRole(
            {
              user_id: subjectId,
              tenant_id: tenantId,
              role_slug: 'planner.viewer',
              scope_type: 'tenant',
              scope_id: null,
            },
            { type: 'user', user_id: adminId },
          );

          const { rows, total } = await listUserEvents(
            { tenant_id: tenantId, user_id: adminId, role: 'actor', limit: 25, offset: 0 },
            { type: 'user', user_id: adminId },
          );

          expect(total).toBeGreaterThanOrEqual(1);
          expect(rows.every((r) => r.actor_user_id === adminId)).toBe(true);
          expect(rows.some((r) => r.event_type === 'identity.role_grant.changed')).toBe(true);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('role=subject returns events where the subject path matches', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const { tenantId, adminId, subjectId } = await seed(pool);
          await grantRole(
            {
              user_id: subjectId,
              tenant_id: tenantId,
              role_slug: 'planner.viewer',
              scope_type: 'tenant',
              scope_id: null,
            },
            { type: 'user', user_id: adminId },
          );
          await deactivateUser(subjectId, { type: 'user', user_id: adminId });

          const { rows } = await listUserEvents(
            { tenant_id: tenantId, user_id: subjectId, role: 'subject', limit: 25, offset: 0 },
            { type: 'user', user_id: adminId },
          );

          expect(rows.length).toBeGreaterThanOrEqual(2); // role_grant + deactivated + created
          expect(rows.every((r) => r.subject_user_id === subjectId)).toBe(true);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('role=all includes both actor and subject matches', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const { tenantId, adminId, subjectId } = await seed(pool);
          // admin is both actor and subject of their own creation event (created_via=cli)
          // Generate one event where adminId is the actor:
          await grantRole(
            {
              user_id: subjectId,
              tenant_id: tenantId,
              role_slug: 'planner.viewer',
              scope_type: 'tenant',
              scope_id: null,
            },
            { type: 'user', user_id: adminId },
          );

          const { rows: actorOnly } = await listUserEvents(
            { tenant_id: tenantId, user_id: adminId, role: 'actor', limit: 25, offset: 0 },
            { type: 'user', user_id: adminId },
          );
          const { rows: allRows } = await listUserEvents(
            { tenant_id: tenantId, user_id: adminId, role: 'all', limit: 25, offset: 0 },
            { type: 'user', user_id: adminId },
          );

          expect(allRows.length).toBeGreaterThanOrEqual(actorOnly.length);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('isolates results by tenant', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const a = await seed(pool);
          const b = await seed(pool);
          await deactivateUser(b.subjectId, { type: 'user', user_id: b.adminId });

          // Query tenant A for the subject in tenant B — must return zero.
          const { rows } = await listUserEvents(
            { tenant_id: a.tenantId, user_id: b.subjectId, role: 'all', limit: 25, offset: 0 },
            { type: 'user', user_id: a.adminId },
          );
          expect(rows).toHaveLength(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('produces a non-empty summary for each known event type', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const { tenantId, adminId, subjectId } = await seed(pool);
          await grantRole(
            {
              user_id: subjectId,
              tenant_id: tenantId,
              role_slug: 'planner.viewer',
              scope_type: 'tenant',
              scope_id: null,
            },
            { type: 'user', user_id: adminId },
          );
          await changeUserEmail(
            { user_id: subjectId, new_email: 'new@t.local', reason: 'admin' },
            { type: 'user', user_id: adminId },
          );
          await resetUserPasswordByAdmin(
            { tenant_id: tenantId, user_id: subjectId },
            { type: 'user', user_id: adminId },
          );

          const { rows } = await listUserEvents(
            { tenant_id: tenantId, user_id: subjectId, role: 'subject', limit: 25, offset: 0 },
            { type: 'user', user_id: adminId },
          );

          expect(rows.every((r) => typeof r.summary === 'string' && r.summary.length > 0)).toBe(
            true,
          );
          const rolesSummary = rows.find((r) => r.event_type === 'identity.role_grant.changed');
          expect(rolesSummary?.summary).toMatch(/planner.viewer.*granted/);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
