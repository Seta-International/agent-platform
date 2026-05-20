import { resetCoreDb } from '@seta/core/internal/test-support';
import { createUser, linkSsoAccount } from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const CLI_ACTOR = { type: 'cli' as const, user_id: null };
const SSO_ACTOR = { type: 'sso' as const, user_id: null };

const ENTRA_OID = 'oid-alice-001';
const ENTRA_TID = 'tid-contoso-001';

describe('@seta/identity linkSsoAccount', () => {
  it('linked: pre-provisioned user, no prior account row → outcome linked, emits sso_linked', async () => {
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
          await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Contoso', $2)`, [
            tenantId,
            `contoso-${tenantId.slice(0, 8)}`,
          ]);

          await createUser(
            {
              tenant_id: tenantId,
              email: 'alice@contoso.com',
              name: 'Alice',
              password: 'alice-password-5678',
            },
            CLI_ACTOR,
          );

          const result = await linkSsoAccount(
            {
              tenant_id: tenantId,
              provider_id: 'microsoft-entra-id',
              email: 'alice@contoso.com',
              name: 'Alice',
              entra_oid: ENTRA_OID,
              entra_tid: ENTRA_TID,
            },
            SSO_ACTOR,
          );

          expect(result.outcome).toBe('linked');
          expect(result.user_id).toBeTruthy();

          const { rows: events } = await pool.query<{ event_type: string }>(
            `SELECT event_type FROM core.events WHERE tenant_id = $1 ORDER BY occurred_at, id`,
            [tenantId],
          );
          const eventTypes = events.map((e) => e.event_type);
          expect(eventTypes).toContain('identity.user.sso_linked');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rejected_not_pre_provisioned: no matching user → no sso_* events', async () => {
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
          await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'NoUsers', $2)`, [
            tenantId,
            `no-users-${tenantId.slice(0, 8)}`,
          ]);

          const result = await linkSsoAccount(
            {
              tenant_id: tenantId,
              provider_id: 'microsoft-entra-id',
              email: 'ghost@contoso.com',
              name: 'Ghost',
              entra_oid: ENTRA_OID,
              entra_tid: ENTRA_TID,
            },
            SSO_ACTOR,
          );

          expect(result.outcome).toBe('rejected_not_pre_provisioned');
          expect(result.user_id).toBe('');

          const { rows: events } = await pool.query<{ event_type: string }>(
            `SELECT event_type FROM core.events WHERE tenant_id = $1 AND event_type LIKE 'identity.user.sso_%'`,
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

  it('rejected_deactivated: deactivated user → emits sso_revoked with user_deactivated', async () => {
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
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'DeactTenant', $2)`,
            [tenantId, `deact-${tenantId.slice(0, 8)}`],
          );

          const { user_id } = await createUser(
            {
              tenant_id: tenantId,
              email: 'bob@contoso.com',
              name: 'Bob',
              password: 'bob-password-5678',
            },
            CLI_ACTOR,
          );

          await pool.query(`UPDATE identity."user" SET deactivated_at = now() WHERE id = $1`, [
            user_id,
          ]);

          const result = await linkSsoAccount(
            {
              tenant_id: tenantId,
              provider_id: 'microsoft-entra-id',
              email: 'bob@contoso.com',
              name: 'Bob',
              entra_oid: ENTRA_OID,
              entra_tid: ENTRA_TID,
            },
            SSO_ACTOR,
          );

          expect(result.outcome).toBe('rejected_deactivated');

          const { rows: events } = await pool.query<{ event_type: string; payload: unknown }>(
            `SELECT event_type, payload FROM core.events
             WHERE tenant_id = $1 AND event_type = 'identity.user.sso_revoked'`,
            [tenantId],
          );
          expect(events).toHaveLength(1);
          expect((events[0]!.payload as { reason: string }).reason).toBe('user_deactivated');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('matched: existing account row with same entra_oid → outcome matched, no new sso_linked', async () => {
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
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'MatchTenant', $2)`,
            [tenantId, `match-${tenantId.slice(0, 8)}`],
          );

          const { user_id } = await createUser(
            {
              tenant_id: tenantId,
              email: 'carol@contoso.com',
              name: 'Carol',
              password: 'carol-password-5678',
            },
            CLI_ACTOR,
          );

          // First link establishes the account row
          const firstResult = await linkSsoAccount(
            {
              tenant_id: tenantId,
              provider_id: 'microsoft-entra-id',
              email: 'carol@contoso.com',
              name: 'Carol',
              entra_oid: ENTRA_OID,
              entra_tid: ENTRA_TID,
            },
            SSO_ACTOR,
          );
          expect(firstResult.outcome).toBe('linked');

          // Seed the account row that better-auth would have created
          await pool.query(
            `INSERT INTO identity.account (id, user_id, provider_id, account_id)
             VALUES ($1, $2, 'microsoft', $3)
             ON CONFLICT DO NOTHING`,
            [crypto.randomUUID(), user_id, ENTRA_OID],
          );

          const ssoLinkedCountBefore = (
            await pool.query<{ n: string }>(
              `SELECT count(*)::int AS n FROM core.events
               WHERE tenant_id = $1 AND event_type = 'identity.user.sso_linked'`,
              [tenantId],
            )
          ).rows[0]!.n;

          // Second call with same OID → matched
          const secondResult = await linkSsoAccount(
            {
              tenant_id: tenantId,
              provider_id: 'microsoft-entra-id',
              email: 'carol@contoso.com',
              name: 'Carol',
              entra_oid: ENTRA_OID,
              entra_tid: ENTRA_TID,
            },
            SSO_ACTOR,
          );
          expect(secondResult.outcome).toBe('matched');

          const ssoLinkedCountAfter = (
            await pool.query<{ n: string }>(
              `SELECT count(*)::int AS n FROM core.events
               WHERE tenant_id = $1 AND event_type = 'identity.user.sso_linked'`,
              [tenantId],
            )
          ).rows[0]!.n;

          // No new sso_linked event emitted on second call
          expect(Number(ssoLinkedCountAfter)).toBe(Number(ssoLinkedCountBefore));
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rejected_oid_conflict: existing account row with different entra_oid → no events', async () => {
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
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'ConflictTenant', $2)`,
            [tenantId, `conflict-${tenantId.slice(0, 8)}`],
          );

          const { user_id } = await createUser(
            {
              tenant_id: tenantId,
              email: 'dave@contoso.com',
              name: 'Dave',
              password: 'dave-password-5678',
            },
            CLI_ACTOR,
          );

          // Seed account row with a different OID
          await pool.query(
            `INSERT INTO identity.account (id, user_id, provider_id, account_id)
             VALUES ($1, $2, 'microsoft', 'oid-different-999')`,
            [crypto.randomUUID(), user_id],
          );

          const result = await linkSsoAccount(
            {
              tenant_id: tenantId,
              provider_id: 'microsoft-entra-id',
              email: 'dave@contoso.com',
              name: 'Dave',
              entra_oid: ENTRA_OID,
              entra_tid: ENTRA_TID,
            },
            SSO_ACTOR,
          );

          expect(result.outcome).toBe('rejected_oid_conflict');

          const { rows: events } = await pool.query<{ event_type: string }>(
            `SELECT event_type FROM core.events
             WHERE tenant_id = $1 AND event_type LIKE 'identity.user.sso_%'`,
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

  it('linked + email sync: stored email has mixed case → normalised on link, email.changed emitted', async () => {
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
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'EmailSyncTenant', $2)`,
            [tenantId, `email-sync-${tenantId.slice(0, 8)}`],
          );

          // Seed user with mixed-case email directly, bypassing createUser normalisation.
          // This simulates a user imported via a legacy path with a non-lowercased email.
          const userId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO identity."user" (id, email, name, email_verified, tenant_id)
             VALUES ($1, 'Bob.Old@acme.com', 'Bob', true, $2)`,
            [userId, tenantId],
          );

          // linkSsoAccount finds the user via lower(email) = 'bob.old@acme.com'
          // syncProfileFromIdToken sees current_email 'Bob.Old@acme.com' != lowercased 'bob.old@acme.com'
          const result = await linkSsoAccount(
            {
              tenant_id: tenantId,
              provider_id: 'microsoft-entra-id',
              email: 'bob.old@acme.com',
              name: 'Bob',
              entra_oid: ENTRA_OID,
              entra_tid: ENTRA_TID,
            },
            SSO_ACTOR,
          );

          expect(result.outcome).toBe('linked');
          expect(result.user_id).toBe(userId);

          const { rows: userRows } = await pool.query<{ email: string }>(
            `SELECT email FROM identity."user" WHERE id = $1`,
            [userId],
          );
          expect(userRows[0]!.email).toBe('bob.old@acme.com');

          const { rows: events } = await pool.query<{ event_type: string; payload: unknown }>(
            `SELECT event_type, payload FROM core.events WHERE tenant_id = $1 ORDER BY occurred_at, id`,
            [tenantId],
          );
          const eventTypes = events.map((e) => e.event_type);
          expect(eventTypes).toContain('identity.user.sso_linked');
          expect(eventTypes).toContain('identity.user.email.changed');

          const emailEvent = events.find((e) => e.event_type === 'identity.user.email.changed');
          expect((emailEvent!.payload as { reason: string }).reason).toBe('sso_sync');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('linked + name sync: sso name differs → user name updated, both sso_linked and profile.updated emitted', async () => {
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
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'SyncTenant', $2)`,
            [tenantId, `sync-${tenantId.slice(0, 8)}`],
          );

          await createUser(
            {
              tenant_id: tenantId,
              email: 'eve@contoso.com',
              name: 'Eve Old',
              password: 'eve-password-5678',
            },
            CLI_ACTOR,
          );

          const result = await linkSsoAccount(
            {
              tenant_id: tenantId,
              provider_id: 'microsoft-entra-id',
              email: 'eve@contoso.com',
              name: 'Eve New',
              entra_oid: ENTRA_OID,
              entra_tid: ENTRA_TID,
            },
            SSO_ACTOR,
          );

          expect(result.outcome).toBe('linked');

          const { rows: userRows } = await pool.query<{ name: string }>(
            `SELECT name FROM identity."user" WHERE id = $1`,
            [result.user_id],
          );
          expect(userRows[0]!.name).toBe('Eve New');

          const { rows: events } = await pool.query<{ event_type: string }>(
            `SELECT event_type FROM core.events WHERE tenant_id = $1 ORDER BY occurred_at, id`,
            [tenantId],
          );
          const eventTypes = events.map((e) => e.event_type);
          expect(eventTypes.indexOf('identity.user.sso_linked')).toBeLessThan(
            eventTypes.indexOf('identity.user.profile.updated'),
          );
          expect(eventTypes).toEqual(
            expect.arrayContaining(['identity.user.sso_linked', 'identity.user.profile.updated']),
          );
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
