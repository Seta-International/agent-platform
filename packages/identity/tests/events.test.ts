import { withEmit } from '@seta/core/events';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { emitIdentityRoleGrantChanged, emitIdentityUserCreated } from '../src/events/index.ts';

describe('identity event emit helpers', () => {
  it('emits identity.user.created with the expected payload shape', async () => {
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
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Demo', 'demo')`,
            [tenantId],
          );

          const userId = crypto.randomUUID();
          await withEmit({ actor: { userId: 'system', tenantId } }, async () => {
            await emitIdentityUserCreated({
              actor: { type: 'cli', user_id: null },
              after: {
                user_id: userId,
                tenant_id: tenantId,
                email: 'a@d.local',
                name: 'A',
                created_via: 'cli',
              },
            });
          });

          const rows = (
            await pool.query(
              `SELECT event_type, payload FROM core.events WHERE event_type = 'identity.user.created'`,
            )
          ).rows;
          expect(rows.length).toBe(1);
          expect(rows[0].payload.actor.type).toBe('cli');
          expect(rows[0].payload.after.email).toBe('a@d.local');
          expect(rows[0].payload.after.created_via).toBe('cli');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('emits identity.role_grant.changed with aggregate_id = user_id (not grant_id)', async () => {
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
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Demo', 'demo')`,
            [tenantId],
          );

          const userId = crypto.randomUUID();
          const grantId = crypto.randomUUID();
          await withEmit({ actor: { userId: 'system', tenantId } }, async () => {
            await emitIdentityRoleGrantChanged({
              actor: { type: 'cli', user_id: null },
              user_id: userId,
              tenant_id: tenantId,
              change: 'granted',
              grant: {
                grant_id: grantId,
                role_slug: 'org.admin',
                scope_type: 'tenant',
                scope_id: null,
                granted_via: 'cli',
              },
            });
          });

          const rows = (
            await pool.query(
              `SELECT aggregate_id, payload FROM core.events WHERE event_type = 'identity.role_grant.changed'`,
            )
          ).rows;
          expect(rows[0].aggregate_id).toBe(userId);
          expect(rows[0].payload.grant.granted_via).toBe('cli');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
