import { coreDb } from '@seta/core/db';
import { coreTenants } from '@seta/core/db/schema';
import { INTEGRATIONS_PERMISSIONS, setMailTransportConfig } from '@seta/integrations';
import { createCrypto, createKeyProviderFromEnv, parseCryptoEnv } from '@seta/shared-crypto';
import { eq } from 'drizzle-orm';
import pino from 'pino';

export interface MailSetOpts {
  tenant: string;
  kind: 'graph' | 'smtp';
  sender: string;
  senderDisplayName?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  smtpRequireTls?: boolean;
  policyAcked?: boolean;
}

async function resolveTenantId(slugOrId: string): Promise<string> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(slugOrId)) {
    return slugOrId;
  }
  const [row] = await coreDb()
    .select({ id: coreTenants.id })
    .from(coreTenants)
    .where(eq(coreTenants.slug, slugOrId))
    .limit(1);
  if (!row) throw new Error(`tenant not found by slug or id: ${slugOrId}`);
  return row.id;
}

export async function integrationsMailSetCommand(opts: MailSetOpts): Promise<void> {
  const log = pino({ name: 'cli/mail-set' });
  const tenantId = await resolveTenantId(opts.tenant);
  const cryptoEnv = parseCryptoEnv(process.env);
  const keyProvider = await createKeyProviderFromEnv(cryptoEnv);
  const cryptoSvc = createCrypto({ keyProvider, log: log.child({ component: 'crypto' }) });
  const actor = {
    user_id: 0,
    tenantId,
    permissions: new Set<string>([INTEGRATIONS_PERMISSIONS.mailConfigure]),
  };

  if (opts.kind === 'graph') {
    await setMailTransportConfig({
      tenantId,
      actor,
      input: {
        kind: 'graph',
        senderAddress: opts.sender,
        senderDisplayName: opts.senderDisplayName ?? null,
        config: { app_access_policy_documented: opts.policyAcked === true },
      },
      crypto: { encrypt: (p) => cryptoSvc.encrypt(p) },
    });
  } else {
    if (!opts.smtpHost || !opts.smtpPort || !opts.smtpUser || !opts.smtpPassword) {
      throw new Error('smtp requires --smtp-host --smtp-port --smtp-user --smtp-password');
    }
    if (opts.smtpPort !== 465 && opts.smtpPort !== 587) {
      throw new Error('smtp port must be 465 or 587');
    }
    await setMailTransportConfig({
      tenantId,
      actor,
      input: {
        kind: 'smtp',
        senderAddress: opts.sender,
        senderDisplayName: opts.senderDisplayName ?? null,
        config: {
          host: opts.smtpHost,
          port: opts.smtpPort,
          username: opts.smtpUser,
          password: opts.smtpPassword,
          require_tls: opts.smtpRequireTls !== false,
        },
      },
      crypto: { encrypt: (p) => cryptoSvc.encrypt(p) },
    });
  }
  log.info({ tenantId, kind: opts.kind, sender: opts.sender }, 'mail transport configured');
}
