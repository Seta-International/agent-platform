import type { EncryptedBlob } from '@seta/shared-crypto';
import { describe, expect, it } from 'vitest';
import type { MailerEnv } from '../src/env.ts';
import { resolveTransport } from '../src/resolve-transport.ts';

const BASE_ENV: MailerEnv = {
  MAILER_DEFAULT_TRANSPORT: 'dev-stub',
  MAILER_DEFAULT_SENDER: 'noreply@seta.example',
};

const fakeBlob: EncryptedBlob = {
  v: 1,
  alg: 'A256GCM',
  kid: 'env:test',
  wdk: 'x',
  iv: 'y',
  ct: 'z',
  tag: 't',
};

describe('resolveTransport', () => {
  it('falls back to operator dev-stub when no tenant config', async () => {
    const t = await resolveTransport('tenant-1', {
      env: BASE_ENV,
      configStore: { findEnabled: async () => null },
      lookupEntraTenantId: async () => null,
      crypto: { decrypt: async () => 'pw' },
    });
    expect(t.transport.kind).toBe('dev-stub');
    expect(t.sender).toBe('noreply@seta.example');
    expect(t.transportKind).toBe('operator-dev-stub');
  });

  it('uses tenant SMTP when configured', async () => {
    const t = await resolveTransport('tenant-1', {
      env: BASE_ENV,
      configStore: {
        findEnabled: async () => ({
          tenantId: 'tenant-1',
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
          enabled: true,
          lastVerifiedAt: null,
          lastVerifyError: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
      lookupEntraTenantId: async () => null,
      crypto: { decrypt: async () => 'pw' },
    });
    expect(t.transport.kind).toBe('smtp');
    expect(t.transportKind).toBe('smtp');
    expect(t.sender).toBe('noreply@acme.test');
  });

  it('throws TRANSPORT_UNCONFIGURED when tenant kind=graph but entra not configured', async () => {
    await expect(
      resolveTransport('tenant-1', {
        env: BASE_ENV,
        configStore: {
          findEnabled: async () => ({
            tenantId: 'tenant-1',
            kind: 'graph',
            senderAddress: 'noreply@acme.test',
            senderDisplayName: null,
            config: { app_access_policy_documented: true },
            enabled: true,
            lastVerifiedAt: null,
            lastVerifyError: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
        lookupEntraTenantId: async () => null,
        crypto: { decrypt: async () => 'pw' },
      }),
    ).rejects.toMatchObject({ code: 'TRANSPORT_UNCONFIGURED' });
  });

  it('builds Graph transport when tenant configured and entra present', async () => {
    const t = await resolveTransport('tenant-1', {
      env: { ...BASE_ENV, MAILER_GRAPH_CLIENT_ID: 'cid', MAILER_GRAPH_CLIENT_SECRET: 'csec' },
      configStore: {
        findEnabled: async () => ({
          tenantId: 'tenant-1',
          kind: 'graph',
          senderAddress: 'noreply@acme.test',
          senderDisplayName: null,
          config: { app_access_policy_documented: true },
          enabled: true,
          lastVerifiedAt: null,
          lastVerifyError: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
      lookupEntraTenantId: async () => 'entra-tid',
      crypto: { decrypt: async () => 'pw' },
    });
    expect(t.transport.kind).toBe('graph');
    expect(t.transportKind).toBe('graph');
  });
});
