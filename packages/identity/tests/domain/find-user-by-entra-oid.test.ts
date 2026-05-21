import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { findEntraOidByUserId } from '../../src/backend/domain/find-entra-oid-by-user-id.ts';
import { findUserByEntraOid } from '../../src/backend/domain/find-user-by-entra-oid.ts';

describe('findUserByEntraOid', () => {
  it('returns user_id and tenant_id for a provisioned Entra user', async () => {
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
          const userId = crypto.randomUUID();
          const entraOid = crypto.randomUUID();

          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Test Org', $2)`,
            [tenantId, `t-${tenantId.slice(0, 8)}`],
          );
          await pool.query(
            `INSERT INTO identity."user" (id, email, name, email_verified, tenant_id)
             VALUES ($1, 'alice@example.com', 'Alice', true, $2)`,
            [userId, tenantId],
          );
          await pool.query(
            `INSERT INTO identity.account (id, user_id, provider_id, account_id)
             VALUES ($1, $2, 'microsoft-entra-id', $3)`,
            [crypto.randomUUID(), userId, entraOid],
          );

          const result = await findUserByEntraOid({ entra_oid: entraOid, tenant_id: tenantId });
          expect(result).not.toBeNull();
          expect(result!.user_id).toBe(userId);
          expect(result!.tenant_id).toBe(tenantId);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns null when no account exists for the entra_oid', async () => {
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
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Test Org', $2)`,
            [tenantId, `t-${tenantId.slice(0, 8)}`],
          );

          const result = await findUserByEntraOid({
            entra_oid: crypto.randomUUID(),
            tenant_id: tenantId,
          });
          expect(result).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns null for a deactivated user', async () => {
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
          const userId = crypto.randomUUID();
          const entraOid = crypto.randomUUID();

          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Test Org', $2)`,
            [tenantId, `t-${tenantId.slice(0, 8)}`],
          );
          await pool.query(
            `INSERT INTO identity."user" (id, email, name, email_verified, tenant_id)
             VALUES ($1, 'eve@example.com', 'Eve', true, $2)`,
            [userId, tenantId],
          );
          await pool.query(
            `INSERT INTO identity.account (id, user_id, provider_id, account_id)
             VALUES ($1, $2, 'microsoft-entra-id', $3)`,
            [crypto.randomUUID(), userId, entraOid],
          );
          await pool.query(`UPDATE identity."user" SET deactivated_at = now() WHERE id = $1`, [
            userId,
          ]);

          const result = await findUserByEntraOid({ entra_oid: entraOid, tenant_id: tenantId });
          expect(result).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns null when account exists in a different tenant', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantA = crypto.randomUUID();
          const tenantB = crypto.randomUUID();
          const userId = crypto.randomUUID();
          const entraOid = crypto.randomUUID();

          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Org A', $2), ($3, 'Org B', $4)`,
            [tenantA, `a-${tenantA.slice(0, 8)}`, tenantB, `b-${tenantB.slice(0, 8)}`],
          );
          await pool.query(
            `INSERT INTO identity."user" (id, email, name, email_verified, tenant_id)
             VALUES ($1, 'bob@a.com', 'Bob', true, $2)`,
            [userId, tenantA],
          );
          await pool.query(
            `INSERT INTO identity.account (id, user_id, provider_id, account_id)
             VALUES ($1, $2, 'microsoft-entra-id', $3)`,
            [crypto.randomUUID(), userId, entraOid],
          );

          // Look up in tenant B — should not find the user from tenant A
          const result = await findUserByEntraOid({ entra_oid: entraOid, tenant_id: tenantB });
          expect(result).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

describe('findEntraOidByUserId', () => {
  it('returns entra_oid for a linked user', async () => {
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
          const userId = crypto.randomUUID();
          const entraOid = crypto.randomUUID();

          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Test Org', $2)`,
            [tenantId, `t-${tenantId.slice(0, 8)}`],
          );
          await pool.query(
            `INSERT INTO identity."user" (id, email, name, email_verified, tenant_id)
             VALUES ($1, 'carol@example.com', 'Carol', true, $2)`,
            [userId, tenantId],
          );
          await pool.query(
            `INSERT INTO identity.account (id, user_id, provider_id, account_id)
             VALUES ($1, $2, 'microsoft-entra-id', $3)`,
            [crypto.randomUUID(), userId, entraOid],
          );

          const result = await findEntraOidByUserId({ user_id: userId, tenant_id: tenantId });
          expect(result).toBe(entraOid);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns null for a deactivated user', async () => {
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
          const userId = crypto.randomUUID();
          const entraOid = crypto.randomUUID();

          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Test Org', $2)`,
            [tenantId, `t-${tenantId.slice(0, 8)}`],
          );
          await pool.query(
            `INSERT INTO identity."user" (id, email, name, email_verified, tenant_id)
             VALUES ($1, 'frank@example.com', 'Frank', true, $2)`,
            [userId, tenantId],
          );
          await pool.query(
            `INSERT INTO identity.account (id, user_id, provider_id, account_id)
             VALUES ($1, $2, 'microsoft-entra-id', $3)`,
            [crypto.randomUUID(), userId, entraOid],
          );
          await pool.query(`UPDATE identity."user" SET deactivated_at = now() WHERE id = $1`, [
            userId,
          ]);

          const result = await findEntraOidByUserId({ user_id: userId, tenant_id: tenantId });
          expect(result).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns null for a user with no Entra account link', async () => {
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
          const userId = crypto.randomUUID();

          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Test Org', $2)`,
            [tenantId, `t-${tenantId.slice(0, 8)}`],
          );
          await pool.query(
            `INSERT INTO identity."user" (id, email, name, email_verified, tenant_id)
             VALUES ($1, 'dave@example.com', 'Dave', true, $2)`,
            [userId, tenantId],
          );

          const result = await findEntraOidByUserId({ user_id: userId, tenant_id: tenantId });
          expect(result).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
