import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../src/backend/domain/create-user.ts';
import { IdentityError } from '../../src/backend/rbac.ts';

describe('createUser', () => {
  it('happy path: creates user + account + profile rows and emits identity.user.created', async () => {
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
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Test Org', 'test-org')`,
            [tenantId],
          );

          const result = await createUser(
            {
              tenant_id: tenantId,
              email: 'Alice@Example.COM',
              name: 'Alice',
              password: 'correct-horse-battery-staple',
            },
            { type: 'cli', user_id: null },
          );

          expect(result.user_id).toBeTypeOf('string');

          // user row
          const userRows = (
            await pool.query(
              `SELECT email, name, email_verified FROM identity."user" WHERE id = $1`,
              [result.user_id],
            )
          ).rows;
          expect(userRows).toHaveLength(1);
          expect(userRows[0].email).toBe('alice@example.com');
          expect(userRows[0].name).toBe('Alice');
          expect(userRows[0].email_verified).toBe(true);

          // account row with credential provider
          const accountRows = (
            await pool.query(
              `SELECT provider_id, password FROM identity.account WHERE user_id = $1`,
              [result.user_id],
            )
          ).rows;
          expect(accountRows).toHaveLength(1);
          expect(accountRows[0].provider_id).toBe('credential');
          expect(accountRows[0].password).toMatch(/^\$argon2id\$/);

          // user_profile row
          const profileRows = (
            await pool.query(`SELECT user_id FROM identity.user_profile WHERE user_id = $1`, [
              result.user_id,
            ])
          ).rows;
          expect(profileRows).toHaveLength(1);

          // event
          const eventRows = (
            await pool.query(
              `SELECT event_type, payload FROM core.events WHERE event_type = 'identity.user.created' AND aggregate_id = $1`,
              [result.user_id],
            )
          ).rows;
          expect(eventRows).toHaveLength(1);
          expect(eventRows[0].payload.after.email).toBe('alice@example.com');
          expect(eventRows[0].payload.after.created_via).toBe('cli');
          expect(eventRows[0].payload.actor.type).toBe('cli');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('initial_role: emits identity.role_grant.changed then identity.user.created', async () => {
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
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Role Org', 'role-org')`,
            [tenantId],
          );

          const result = await createUser(
            {
              tenant_id: tenantId,
              email: 'bob@example.com',
              name: 'Bob',
              password: 'correct-horse-battery-staple',
              initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
            },
            { type: 'cli', user_id: null },
          );

          // role_grants row exists
          const grantRows = (
            await pool.query(
              `SELECT role_slug, granted_via FROM identity.role_grants WHERE user_id = $1`,
              [result.user_id],
            )
          ).rows;
          expect(grantRows).toHaveLength(1);
          expect(grantRows[0].role_slug).toBe('org.admin');
          expect(grantRows[0].granted_via).toBe('cli');

          // 2 events in insert order (ctid is physical row order within the same tx)
          const eventRows = (
            await pool.query(
              `SELECT event_type FROM core.events WHERE aggregate_id = $1 ORDER BY occurred_at, ctid`,
              [result.user_id],
            )
          ).rows;
          expect(eventRows).toHaveLength(2);
          expect(eventRows[0].event_type).toBe('identity.role_grant.changed');
          expect(eventRows[1].event_type).toBe('identity.user.created');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rejects passwords shorter than 12 characters with PASSWORD_LENGTH', async () => {
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
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Short Org', 'short-org')`,
            [tenantId],
          );

          await expect(
            createUser(
              {
                tenant_id: tenantId,
                email: 'charlie@example.com',
                name: 'Charlie',
                password: 'short',
              },
              { type: 'cli', user_id: null },
            ),
          ).rejects.toSatisfy(
            (e: unknown) => e instanceof IdentityError && /PASSWORD_LENGTH/.test(e.code),
          );
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
