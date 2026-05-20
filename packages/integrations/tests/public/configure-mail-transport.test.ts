import { resetCoreDb } from '@seta/core/internal/test-support';
import type { EncryptedBlob } from '@seta/shared-crypto';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { disableMailTransportConfig } from '../../src/backend/domain/disable-mail-transport-config.ts';
import { getMailTransportConfig } from '../../src/backend/domain/get-mail-transport-config.ts';
import { setMailTransportConfig } from '../../src/backend/domain/set-mail-transport-config.ts';
import { INTEGRATIONS_PERMISSIONS } from '../../src/backend/rbac.ts';
import { resetIntegrationsDb } from '../../src/db/client.ts';

const fakeBlob: EncryptedBlob = {
  v: 1,
  alg: 'A256GCM',
  kid: 'env:test',
  wdk: 'AAAA',
  iv: 'BBBB',
  ct: 'CCCC',
  tag: 'DDDD',
};
const fakeEncrypt = async (_p: string): Promise<EncryptedBlob> => fakeBlob;

async function setup(pool: import('pg').Pool, databaseUrl: string) {
  resetCoreDb();
  resetIntegrationsDb();
  initPools({ databaseUrl });
  const tenantId = crypto.randomUUID();
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Acme', $2)`, [
    tenantId,
    `acme-${tenantId.slice(0, 8)}`,
  ]);
  const actor = {
    user_id: 42,
    tenantId,
    permissions: new Set<string>([INTEGRATIONS_PERMISSIONS.mailConfigure]),
  };
  return { tenantId, actor };
}

describe('mail transport config domain', () => {
  it('admin can set + get a Graph config', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        const { tenantId, actor } = await setup(pool, databaseUrl);
        try {
          await setMailTransportConfig({
            tenantId,
            actor,
            input: {
              kind: 'graph',
              senderAddress: 'noreply@acme.test',
              senderDisplayName: 'Acme',
              config: { app_access_policy_documented: true },
            },
            crypto: { encrypt: fakeEncrypt },
          });
          const row = await getMailTransportConfig(tenantId, actor);
          expect(row).toMatchObject({
            kind: 'graph',
            senderAddress: 'noreply@acme.test',
            enabled: true,
          });
        } finally {
          resetCoreDb();
          resetIntegrationsDb();
          await closePools();
        }
      },
    );
  });

  it('admin can set + get an SMTP config with encrypted password', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        const { tenantId, actor } = await setup(pool, databaseUrl);
        try {
          await setMailTransportConfig({
            tenantId,
            actor,
            input: {
              kind: 'smtp',
              senderAddress: 'noreply@acme.test',
              senderDisplayName: null,
              config: {
                host: 'smtp.acme.test',
                port: 587,
                username: 'u',
                password: 'pw',
                require_tls: true,
              },
            },
            crypto: { encrypt: fakeEncrypt },
          });
          const row = await getMailTransportConfig(tenantId, actor);
          expect(row?.kind).toBe('smtp');
          const smtp = row?.config as { host: string; port: number; password_blob: EncryptedBlob };
          expect(smtp.host).toBe('smtp.acme.test');
          expect(smtp.port).toBe(587);
          expect(smtp.password_blob).toEqual(fakeBlob);
        } finally {
          resetCoreDb();
          resetIntegrationsDb();
          await closePools();
        }
      },
    );
  });

  it('rejects invalid SMTP port', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        const { tenantId, actor } = await setup(pool, databaseUrl);
        try {
          await expect(
            setMailTransportConfig({
              tenantId,
              actor,
              input: {
                kind: 'smtp',
                senderAddress: 'a@b.com',
                senderDisplayName: null,
                config: {
                  host: 'h',
                  port: 99999 as 465 | 587,
                  username: 'u',
                  password: 'p',
                  require_tls: true,
                },
              },
              crypto: { encrypt: fakeEncrypt },
            }),
          ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
        } finally {
          resetCoreDb();
          resetIntegrationsDb();
          await closePools();
        }
      },
    );
  });

  it('rejects when actor lacks permission', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        const { tenantId } = await setup(pool, databaseUrl);
        const actorNoPerm = { user_id: 1, tenantId, permissions: new Set<string>() };
        try {
          await expect(
            setMailTransportConfig({
              tenantId,
              actor: actorNoPerm,
              input: {
                kind: 'graph',
                senderAddress: 'a@b.com',
                senderDisplayName: null,
                config: { app_access_policy_documented: true },
              },
              crypto: { encrypt: fakeEncrypt },
            }),
          ).rejects.toMatchObject({ code: 'FORBIDDEN' });
        } finally {
          resetCoreDb();
          resetIntegrationsDb();
          await closePools();
        }
      },
    );
  });

  it('disable hides the config from getMailTransportConfig', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        const { tenantId, actor } = await setup(pool, databaseUrl);
        try {
          await setMailTransportConfig({
            tenantId,
            actor,
            input: {
              kind: 'graph',
              senderAddress: 'a@b.com',
              senderDisplayName: null,
              config: { app_access_policy_documented: true },
            },
            crypto: { encrypt: fakeEncrypt },
          });
          await disableMailTransportConfig({ tenantId, actor });
          expect(await getMailTransportConfig(tenantId, actor)).toBeNull();
        } finally {
          resetCoreDb();
          resetIntegrationsDb();
          await closePools();
        }
      },
    );
  });
});
