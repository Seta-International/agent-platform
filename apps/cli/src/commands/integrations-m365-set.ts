import { coreDb } from '@seta/core/db';
import { coreTenants } from '@seta/core/db/schema';
import { INTEGRATIONS_PERMISSIONS, setM365TenantConfig } from '@seta/integrations';
import { createCrypto, createKeyProviderFromEnv, parseCryptoEnv } from '@seta/shared-crypto';
import { eq } from 'drizzle-orm';
import pino from 'pino';

export interface M365SetOpts {
  tenant: string;
  entraTenantId: string;
  clientId: string;
  clientSecret: string;
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

export async function integrationsM365SetCommand(opts: M365SetOpts): Promise<void> {
  const log = pino({ name: 'cli/m365-set' });
  const tenantId = await resolveTenantId(opts.tenant);
  const cryptoEnv = parseCryptoEnv(process.env);
  const keyProvider = await createKeyProviderFromEnv(cryptoEnv);
  const cryptoSvc = createCrypto({ keyProvider, log: log.child({ component: 'crypto' }) });
  const actor = {
    user_id: 0,
    tenantId,
    permissions: new Set<string>([INTEGRATIONS_PERMISSIONS.m365ConfigWrite]),
  };

  await setM365TenantConfig({
    tenantId,
    actor,
    input: {
      entra_tenant_id: opts.entraTenantId,
      client_id: opts.clientId,
      client_secret_plaintext: opts.clientSecret,
    },
    crypto: { encrypt: (p) => cryptoSvc.encrypt(p) },
  });

  log.info({ tenantId, clientId: opts.clientId }, 'm365 tenant config set');
}
