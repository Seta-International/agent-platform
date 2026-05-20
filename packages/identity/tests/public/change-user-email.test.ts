import { resetCoreDb } from '@seta/core/internal/test-support';
import { changeUserEmail, createUser, IdentityError } from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { afterAll, describe, expect, it } from 'vitest';

const CLI_ACTOR = { type: 'cli' as const, user_id: null };
const SSO_ACTOR = { type: 'sso' as const, user_id: null };

describe('@seta/identity changeUserEmail', () => {
  it('admin path: updates email, emits email.changed with reason admin', async () => {
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
          await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'T1', $2)`, [
            tenantId,
            `t1-${tenantId.slice(0, 8)}`,
          ]);

          const { user_id } = await createUser(
            {
              tenant_id: tenantId,
              email: 'alice@old.com',
              name: 'Alice',
              password: 'alice-password-1234',
            },
            CLI_ACTOR,
          );

          const result = await changeUserEmail(
            { user_id, new_email: 'Alice@New.com', reason: 'admin' },
            CLI_ACTOR,
          );

          expect(result.old_email).toBe('alice@old.com');
          expect(result.new_email).toBe('alice@new.com');

          const { rows: userRows } = await pool.query<{ email: string }>(
            `SELECT email FROM identity."user" WHERE id = $1`,
            [user_id],
          );
          expect(userRows[0]!.email).toBe('alice@new.com');

          const { rows: events } = await pool.query<{ event_type: string; payload: unknown }>(
            `SELECT event_type, payload FROM core.events
             WHERE tenant_id = $1 AND event_type = 'identity.user.email.changed'`,
            [tenantId],
          );
          expect(events).toHaveLength(1);
          const payload = events[0]!.payload as {
            old_email: string;
            new_email: string;
            reason: string;
          };
          expect(payload.old_email).toBe('alice@old.com');
          expect(payload.new_email).toBe('alice@new.com');
          expect(payload.reason).toBe('admin');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('admin path: refuses when user has SSO account row', async () => {
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
          await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'T2', $2)`, [
            tenantId,
            `t2-${tenantId.slice(0, 8)}`,
          ]);

          const { user_id } = await createUser(
            {
              tenant_id: tenantId,
              email: 'bob@acme.com',
              name: 'Bob',
              password: 'bob-password-1234',
            },
            CLI_ACTOR,
          );

          // Seed a microsoft account row to simulate SSO-linked user
          await pool.query(
            `INSERT INTO identity.account (id, user_id, provider_id, account_id)
             VALUES ($1, $2, 'microsoft', 'oid-bob-001')`,
            [crypto.randomUUID(), user_id],
          );

          await expect(
            changeUserEmail(
              { user_id, new_email: 'bob@newdomain.com', reason: 'admin' },
              CLI_ACTOR,
            ),
          ).rejects.toMatchObject({ code: 'EMAIL_MANAGED_BY_SSO' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('sso_sync path: works even when user has microsoft account row, emits reason sso_sync', async () => {
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
          await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'T3', $2)`, [
            tenantId,
            `t3-${tenantId.slice(0, 8)}`,
          ]);

          const { user_id } = await createUser(
            {
              tenant_id: tenantId,
              email: 'carol@acme.com',
              name: 'Carol',
              password: 'carol-password-1234',
            },
            CLI_ACTOR,
          );

          // SSO-linked
          await pool.query(
            `INSERT INTO identity.account (id, user_id, provider_id, account_id)
             VALUES ($1, $2, 'microsoft', 'oid-carol-001')`,
            [crypto.randomUUID(), user_id],
          );

          const result = await changeUserEmail(
            { user_id, new_email: 'carol@newdomain.com', reason: 'sso_sync' },
            SSO_ACTOR,
          );

          expect(result.new_email).toBe('carol@newdomain.com');

          const { rows: events } = await pool.query<{ event_type: string; payload: unknown }>(
            `SELECT event_type, payload FROM core.events
             WHERE tenant_id = $1 AND event_type = 'identity.user.email.changed'`,
            [tenantId],
          );
          expect(events).toHaveLength(1);
          expect((events[0]!.payload as { reason: string }).reason).toBe('sso_sync');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('no-op when new_email matches existing (case-insensitive): zero events emitted', async () => {
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
          await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'T4', $2)`, [
            tenantId,
            `t4-${tenantId.slice(0, 8)}`,
          ]);

          const { user_id } = await createUser(
            {
              tenant_id: tenantId,
              email: 'dave@acme.com',
              name: 'Dave',
              password: 'dave-password-1234',
            },
            CLI_ACTOR,
          );

          // Same email, different case — should be a no-op
          const result = await changeUserEmail(
            { user_id, new_email: 'DAVE@ACME.COM', reason: 'admin' },
            CLI_ACTOR,
          );

          expect(result.old_email).toBe('dave@acme.com');
          expect(result.new_email).toBe('dave@acme.com');

          const { rows: events } = await pool.query<{ event_type: string }>(
            `SELECT event_type FROM core.events
             WHERE tenant_id = $1 AND event_type = 'identity.user.email.changed'`,
            [tenantId],
          );
          expect(events).toHaveLength(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
