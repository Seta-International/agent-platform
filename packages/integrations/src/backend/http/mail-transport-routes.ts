import type { SessionEnv } from '@seta/core';
import { listMyEffectivePermissions } from '@seta/identity';
import type { Crypto, EncryptedBlob } from '@seta/shared-crypto';
import type { MailerEnv } from '@seta/shared-mailer';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import {
  disableMailTransportConfig,
  getMailTransportConfig,
  type IntegrationsActor,
  type MailTransportConfigRow,
  type SetMailTransportConfigInput,
  setMailTransportConfig,
  verifyMailTransport,
} from '../../index.ts';

export interface MailTransportRoutesDeps {
  cryptoSvc: Crypto;
  mailerEnv: MailerEnv;
  lookupEntraTenantId: (tenantId: string) => Promise<string | null>;
}

const graphInputSchema = z.object({
  kind: z.literal('graph'),
  senderAddress: z.email(),
  senderDisplayName: z.string().nullable(),
  config: z.object({ app_access_policy_documented: z.boolean() }),
});

const smtpInputSchema = z.object({
  kind: z.literal('smtp'),
  senderAddress: z.email(),
  senderDisplayName: z.string().nullable(),
  config: z.object({
    host: z.string().min(1),
    port: z
      .number()
      .int()
      .refine((p) => p === 465 || p === 587),
    username: z.string().min(1),
    password: z.string().min(1),
    require_tls: z.boolean(),
  }),
});

const setSchema = z.discriminatedUnion('kind', [graphInputSchema, smtpInputSchema]);
const verifySchema = z.object({ recipient: z.email() });

async function buildActor(c: Context<SessionEnv>): Promise<IntegrationsActor> {
  const scope = c.get('user');
  const perms = await listMyEffectivePermissions({ type: 'user', user_id: scope.user_id });
  return {
    user_id: 0,
    tenantId: scope.tenant_id,
    permissions: new Set(perms),
  };
}

function sanitize(row: MailTransportConfigRow | null): unknown {
  if (!row) return null;
  if (row.kind === 'graph') {
    return {
      kind: 'graph',
      sender_address: row.senderAddress,
      sender_display_name: row.senderDisplayName,
      config: row.config,
      enabled: row.enabled,
      last_verified_at: row.lastVerifiedAt,
      last_verify_error: row.lastVerifyError,
    };
  }
  const cfg = row.config as { host: string; port: number; username: string; require_tls: boolean };
  return {
    kind: 'smtp',
    sender_address: row.senderAddress,
    sender_display_name: row.senderDisplayName,
    config: {
      host: cfg.host,
      port: cfg.port,
      username: cfg.username,
      require_tls: cfg.require_tls,
    },
    enabled: row.enabled,
    last_verified_at: row.lastVerifiedAt,
    last_verify_error: row.lastVerifyError,
  };
}

export function registerMailTransportRoutes(
  app: Hono<SessionEnv>,
  deps: MailTransportRoutesDeps,
): void {
  app.get('/api/integrations/v1/mail-transport', async (c) => {
    const actor = await buildActor(c);
    const row = await getMailTransportConfig(actor.tenantId, actor);
    return c.json(sanitize(row));
  });

  app.put('/api/integrations/v1/mail-transport', async (c) => {
    const actor = await buildActor(c);
    const body = await c.req.json().catch(() => ({}));
    const parsed = setSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid', details: parsed.error.issues }, 400);
    await setMailTransportConfig({
      tenantId: actor.tenantId,
      actor,
      input: parsed.data as SetMailTransportConfigInput,
      crypto: { encrypt: (p) => deps.cryptoSvc.encrypt(p) },
    });
    return c.json({ ok: true });
  });

  app.delete('/api/integrations/v1/mail-transport', async (c) => {
    const actor = await buildActor(c);
    await disableMailTransportConfig({ tenantId: actor.tenantId, actor });
    return c.json({ ok: true });
  });

  app.post('/api/integrations/v1/mail-transport/verify', async (c) => {
    const actor = await buildActor(c);
    const parsed = verifySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: 'invalid' }, 400);
    const result = await verifyMailTransport({
      tenantId: actor.tenantId,
      actor,
      recipient: parsed.data.recipient,
      env: deps.mailerEnv,
      crypto: {
        encrypt: (p: string): Promise<EncryptedBlob> => deps.cryptoSvc.encrypt(p),
        decrypt: (b: EncryptedBlob) => deps.cryptoSvc.decrypt(b),
      },
      lookupEntraTenantId: deps.lookupEntraTenantId,
    });
    return c.json(result);
  });
}
