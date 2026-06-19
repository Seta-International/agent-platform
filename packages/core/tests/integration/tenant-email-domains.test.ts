import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { getTenantEmailDomains } from '../../src/db/tenant-email-domains.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('getTenantEmailDomains', () => {
  it('returns [] by default and the stored list after update', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const tenantId = crypto.randomUUID();
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
          tenantId,
          'Acme',
          `acme-${tenantId.slice(0, 8)}`,
        ]);
        expect(await getTenantEmailDomains(tenantId)).toEqual([]);

        await pool.query(`UPDATE core.tenants SET email_domains = $1 WHERE id = $2`, [
          ['acme.com', 'acme.io'],
          tenantId,
        ]);
        expect(await getTenantEmailDomains(tenantId)).toEqual(['acme.com', 'acme.io']);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
