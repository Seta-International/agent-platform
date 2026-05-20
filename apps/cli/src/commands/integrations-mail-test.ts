import { coreDb } from '@seta/core/db';
import { coreTenants } from '@seta/core/db/schema';
import { getEntraTenantId } from '@seta/identity';
import { INTEGRATIONS_PERMISSIONS, verifyMailTransport } from '@seta/integrations';
import { createCrypto, createKeyProviderFromEnv, parseCryptoEnv } from '@seta/shared-crypto';
import { parseMailerEnv } from '@seta/shared-mailer';
import { eq } from 'drizzle-orm';
import pino from 'pino';

export interface MailTestOpts {
  tenant: string;
  to: string;
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

export async function integrationsMailTestCommand(opts: MailTestOpts): Promise<void> {
  const log = pino({ name: 'cli/mail-test' });
  const tenantId = await resolveTenantId(opts.tenant);
  const mailerEnv = parseMailerEnv(process.env);
  const cryptoEnv = parseCryptoEnv(process.env);
  const keyProvider = await createKeyProviderFromEnv(cryptoEnv);
  const cryptoSvc = createCrypto({ keyProvider, log: log.child({ component: 'crypto' }) });
  const actor = {
    user_id: 0,
    tenantId,
    permissions: new Set<string>([INTEGRATIONS_PERMISSIONS.mailConfigure]),
  };
  const result = await verifyMailTransport({
    tenantId,
    actor,
    recipient: opts.to,
    env: mailerEnv,
    crypto: { encrypt: (p) => cryptoSvc.encrypt(p), decrypt: (b) => cryptoSvc.decrypt(b) },
    lookupEntraTenantId: getEntraTenantId,
  });
  if (result.ok) {
    process.stdout.write(`ok: ${result.transport_message_id ?? '(no message id)'}\n`);
  } else {
    process.stderr.write(`fail: ${result.error?.code} ${result.error?.message}\n`);
    process.exit(1);
  }
}
