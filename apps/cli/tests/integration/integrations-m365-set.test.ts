import { randomUUID } from 'node:crypto';
import { resetCoreDb } from '@seta/core/testing';
import { integrationsDb, resetIntegrationsDb } from '@seta/integrations/db';
import { m365TenantConfig } from '@seta/integrations/db/schema';
import { createCrypto, createKeyProviderFromEnv, parseCryptoEnv } from '@seta/shared-crypto';
import { eq } from 'drizzle-orm';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { integrationsM365SetCommand } from '../../src/commands/integrations-m365-set.ts';
import { withCliTestDb } from '../helpers.ts';

describe('integrations-m365-set', () => {
  const prevProvider = process.env.CRYPTO_KEY_PROVIDER;
  const prevKey = process.env.CRYPTO_LOCAL_MASTER_KEY;
  beforeAll(() => {
    process.env.CRYPTO_KEY_PROVIDER = 'env';
    process.env.CRYPTO_LOCAL_MASTER_KEY = 'a'.repeat(64);
  });
  afterAll(() => {
    process.env.CRYPTO_KEY_PROVIDER = prevProvider;
    process.env.CRYPTO_LOCAL_MASTER_KEY = prevKey;
  });

  it('upserts an enabled m365_tenant_config row with the secret encrypted by the env key', async () => {
    await withCliTestDb(async ({ pool }) => {
      resetCoreDb();
      resetIntegrationsDb();
      const tenantId = randomUUID();
      const entraTenantId = randomUUID();
      await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Acme', $2)`, [
        tenantId,
        `acme-${tenantId.slice(0, 8)}`,
      ]);

      await integrationsM365SetCommand({
        tenant: tenantId,
        entraTenantId,
        clientId: '82f1f47b-3550-4f17-9ade-cfba5789cb07',
        clientSecret: 'super-secret-value',
      });

      const [row] = await integrationsDb()
        .select()
        .from(m365TenantConfig)
        .where(eq(m365TenantConfig.tenantId, tenantId))
        .limit(1);

      expect(row).toBeTruthy();
      expect(row?.enabled).toBe(true);
      expect(row?.clientId).toBe('82f1f47b-3550-4f17-9ade-cfba5789cb07');
      expect(row?.entraTenantId).toBe(entraTenantId);

      // The whole point: the stored secret must decrypt with this env's key.
      const cryptoSvc = createCrypto({
        keyProvider: await createKeyProviderFromEnv(parseCryptoEnv(process.env)),
        log: pino({ level: 'silent' }),
      });
      const plaintext = await cryptoSvc.decrypt(row?.clientSecretBlob as never);
      expect(plaintext).toBe('super-secret-value');
    });
  });
});
