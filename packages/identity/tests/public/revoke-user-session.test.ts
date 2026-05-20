import { resetCoreDb } from '@seta/core/internal/test-support';
import { createUser, IdentityError, revokeUserSession } from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';

const CLI_ACTOR = { type: 'cli' as const, user_id: null };

async function seedTenantWithAdmin(pool: import('pg').Pool): Promise<{
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

async function insertSession(pool: import('pg').Pool, userId: string): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO identity.session (id, user_id, token, expires_at)
     VALUES ($1, $2, $3, now() + interval '1 hour')`,
    [id, userId, crypto.randomUUID()],
  );
  return { id };
}

describe('@seta/identity revokeUserSession', () => {
  it('deletes the session and emits identity.session.revoked', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const { tenantId, adminId, subjectId } = await seedTenantWithAdmin(pool);
          const s = await insertSession(pool, subjectId);

          await revokeUserSession(
            {
              tenant_id: tenantId,
              user_id: subjectId,
              session_id: s.id,
              current_session_id: null,
            },
            { type: 'user', user_id: adminId },
          );

          const { rows } = await pool.query<{ id: string }>(
            `SELECT id FROM identity.session WHERE id = $1`,
            [s.id],
          );
          expect(rows).toHaveLength(0);

          const { rows: events } = await pool.query<{ event_type: string; payload: unknown }>(
            `SELECT event_type, payload FROM core.events
             WHERE tenant_id = $1 AND event_type = 'identity.session.revoked'`,
            [tenantId],
          );
          expect(events).toHaveLength(1);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it("refuses to revoke the caller's own session", async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const { tenantId, adminId } = await seedTenantWithAdmin(pool);
          const own = await insertSession(pool, adminId);

          await expect(
            revokeUserSession(
              {
                tenant_id: tenantId,
                user_id: adminId,
                session_id: own.id,
                current_session_id: own.id,
              },
              { type: 'user', user_id: adminId },
            ),
          ).rejects.toThrow(/own session/i);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('refuses when caller lacks identity.user.write', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'T', $2)`, [
            tenantId,
            `t-${tenantId.slice(0, 8)}`,
          ]);
          const { user_id: viewerId } = await createUser(
            {
              tenant_id: tenantId,
              email: 'viewer@t.local',
              name: 'Viewer',
              password: 'viewer-password-1234',
              initial_role: { role_slug: 'identity.viewer', scope_type: 'tenant', scope_id: null },
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
          const s = await insertSession(pool, subjectId);

          await expect(
            revokeUserSession(
              {
                tenant_id: tenantId,
                user_id: subjectId,
                session_id: s.id,
                current_session_id: null,
              },
              { type: 'user', user_id: viewerId },
            ),
          ).rejects.toThrow(IdentityError);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
