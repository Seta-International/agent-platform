import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetPeopleDb } from '../../src/backend/db/client.ts';
import { getWorkerIdForUser } from '../../src/backend/domain/worker-identity.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('getWorkerIdForUser under RLS', () => {
  // FUT-327 regression: the session middleware resolves the worker id BEFORE the
  // request's tenant GUC is bound (apps/server wires resolvePersonId ahead of
  // runRequestTenant). In production the web pool is seta_app (NOBYPASSRLS), so the
  // forced tenant_isolation policy on people.person/people.worker hid every row and
  // session.person_id was always null — silently disabling AM/EM/TL/PM row scoping.
  // Dev and the default test harness masked it by connecting as a BYPASSRLS superuser,
  // so this test runs the lookup through a web pool that mirrors prod's seta_app.
  it('resolves the worker id via a NOBYPASSRLS web pool with no ambient tenant GUC', () =>
    withTestDb(ctx, async ({ pool, databaseUrl }) => {
      const role = `rls_probe_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      await pool.query(`CREATE ROLE ${role} LOGIN PASSWORD 'probe' NOSUPERUSER NOBYPASSRLS`);
      await pool.query(`GRANT USAGE ON SCHEMA people TO ${role}`);
      await pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA people TO ${role}`);

      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const personId = crypto.randomUUID();
      await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
        tenantId,
        `RLS Probe ${tenantId.slice(0, 8)}`,
        `rls-${tenantId.slice(0, 8)}`,
      ]);
      await pool.query(`INSERT INTO people.person (id, tenant_id, full_name) VALUES ($1, $2, $3)`, [
        personId,
        tenantId,
        'RLS Probe Worker',
      ]);
      await pool.query(
        `INSERT INTO people.user_projection (user_id, tenant_id, person_id) VALUES ($1, $2, $3)`,
        [userId, tenantId, personId],
      );

      const appUrl = new URL(databaseUrl);
      appUrl.username = role;
      appUrl.password = 'probe';

      resetPeopleDb();
      initPools({ databaseUrl, appDatabaseUrl: appUrl.toString() });
      try {
        expect(await getWorkerIdForUser(userId, tenantId)).toBe(personId);
      } finally {
        resetPeopleDb();
        await closePools();
        await pool.query(`DROP OWNED BY ${role}`);
        await pool.query(`DROP ROLE ${role}`);
      }
    }));
});
