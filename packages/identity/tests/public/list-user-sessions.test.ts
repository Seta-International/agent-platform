import { resetCoreDb } from '@seta/core/internal/test-support';
import { createUser, IdentityError, listUserSessions } from '@seta/identity';
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

async function insertSession(
  pool: import('pg').Pool,
  userId: string,
  opts: { expiresInMs: number; ua?: string; ip?: string },
): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO identity.session (id, user_id, token, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, now() + ($4::int || ' milliseconds')::interval, $5, $6)`,
    [id, userId, crypto.randomUUID(), opts.expiresInMs, opts.ip ?? null, opts.ua ?? null],
  );
  return { id };
}

describe('@seta/identity listUserSessions', () => {
  it('returns only non-expired sessions for the given user', async () => {
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
          await insertSession(pool, subjectId, {
            expiresInMs: 60_000,
            ua: 'Mozilla/5.0 ... Firefox/124',
          });
          await insertSession(pool, subjectId, { expiresInMs: -60_000, ua: 'expired-ua' });

          const rows = await listUserSessions(
            { tenant_id: tenantId, user_id: subjectId, current_session_id: null },
            { type: 'user', user_id: adminId },
          );

          expect(rows.length).toBe(1);
          expect(rows[0]?.user_agent).toContain('Firefox');
          expect(rows[0]?.is_current).toBe(false);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('marks the caller-current session with is_current=true', async () => {
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
          const s = await insertSession(pool, subjectId, { expiresInMs: 60_000 });

          const rows = await listUserSessions(
            { tenant_id: tenantId, user_id: subjectId, current_session_id: s.id },
            { type: 'user', user_id: adminId },
          );

          expect(rows[0]?.is_current).toBe(true);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rejects with NOT_FOUND when subject is in another tenant', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const t1 = await seedTenantWithAdmin(pool);
          const t2 = await seedTenantWithAdmin(pool);

          // No sessions seeded → the function probes the user's tenant when 0 rows come back.
          await expect(
            listUserSessions(
              { tenant_id: t1.tenantId, user_id: t2.subjectId, current_session_id: null },
              { type: 'user', user_id: t1.adminId },
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
