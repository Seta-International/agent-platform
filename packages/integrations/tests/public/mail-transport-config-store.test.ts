import type { EncryptedBlob } from '@seta/shared-crypto';
import { describe, expect, it } from 'vitest';
import { createMailTransportConfigStore } from '../../src/backend/domain/mail-transport-config-store.ts';
import { resetIntegrationsDb } from '../../src/db/client.ts';
import { withIntegrationsTestDb } from '../helpers/test-db.ts';

const fakeBlob: EncryptedBlob = {
  v: 1,
  alg: 'A256GCM',
  kid: 'env:test',
  wdk: 'AAAA',
  iv: 'BBBB',
  ct: 'CCCC',
  tag: 'DDDD',
};

describe('mail transport config store', () => {
  it('upsert + findEnabled round-trips a Graph config', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      resetIntegrationsDb();
      const store = createMailTransportConfigStore({ db });
      const tenantId = crypto.randomUUID();
      await store.upsert({
        tenantId,
        kind: 'graph',
        senderAddress: 'noreply@acme.test',
        senderDisplayName: 'Acme',
        config: { app_access_policy_documented: true },
        actorUserId: 42,
      });
      const row = await store.findEnabled(tenantId);
      expect(row).toMatchObject({
        kind: 'graph',
        senderAddress: 'noreply@acme.test',
        config: { app_access_policy_documented: true },
        enabled: true,
      });
    });
  });

  it('findEnabled returns null when disabled', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      resetIntegrationsDb();
      const store = createMailTransportConfigStore({ db });
      const tenantId = crypto.randomUUID();
      await store.upsert({
        tenantId,
        kind: 'graph',
        senderAddress: 'a@b.com',
        senderDisplayName: null,
        config: { app_access_policy_documented: false },
        actorUserId: 1,
      });
      await store.disable(tenantId, 1);
      expect(await store.findEnabled(tenantId)).toBeNull();
    });
  });

  it('upsert preserves SMTP password_blob shape', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      resetIntegrationsDb();
      const store = createMailTransportConfigStore({ db });
      const tenantId = crypto.randomUUID();
      await store.upsert({
        tenantId,
        kind: 'smtp',
        senderAddress: 'noreply@acme.test',
        senderDisplayName: null,
        config: {
          host: 'smtp.acme.test',
          port: 587,
          username: 'user',
          password_blob: fakeBlob,
          require_tls: true,
        },
        actorUserId: 1,
      });
      const row = await store.findEnabled(tenantId);
      expect(row?.kind).toBe('smtp');
      const smtp = row?.config as { host: string; port: number; password_blob: EncryptedBlob };
      expect(smtp.host).toBe('smtp.acme.test');
      expect(smtp.port).toBe(587);
      expect(smtp.password_blob).toEqual(fakeBlob);
    });
  });

  it('recordVerification updates lastVerifiedAt on success', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      resetIntegrationsDb();
      const store = createMailTransportConfigStore({ db });
      const tenantId = crypto.randomUUID();
      await store.upsert({
        tenantId,
        kind: 'graph',
        senderAddress: 'a@b.com',
        senderDisplayName: null,
        config: { app_access_policy_documented: true },
        actorUserId: 1,
      });
      await store.recordVerification(tenantId, { ok: true });
      const row = await store.findEnabled(tenantId);
      expect(row?.lastVerifiedAt).toBeInstanceOf(Date);
      expect(row?.lastVerifyError).toBeNull();
    });
  });

  it('recordVerification records the error message on failure', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      resetIntegrationsDb();
      const store = createMailTransportConfigStore({ db });
      const tenantId = crypto.randomUUID();
      await store.upsert({
        tenantId,
        kind: 'graph',
        senderAddress: 'a@b.com',
        senderDisplayName: null,
        config: { app_access_policy_documented: true },
        actorUserId: 1,
      });
      await store.recordVerification(tenantId, { ok: false, error: 'AUTH_DENIED' });
      const row = await store.findEnabled(tenantId);
      expect(row?.lastVerifyError).toBe('AUTH_DENIED');
    });
  });
});
