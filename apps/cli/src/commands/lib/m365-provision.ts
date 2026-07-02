import { INTEGRATIONS_PERMISSIONS, setM365TenantConfig } from '@seta/integrations';
import { createCrypto, createKeyProviderFromEnv, parseCryptoEnv } from '@seta/shared-crypto';
import type { Logger } from 'pino';

export interface M365EnvConfig {
  entra_tenant_id: string;
  client_id: string;
  client_secret_plaintext: string;
}

/**
 * Read the M365 Graph app credentials from the environment. Returns null unless
 * all three are present (non-blank), so seeding stays a no-op on machines that
 * don't connect M365 (fresh clones, CI). The secret is operator config and must
 * never be committed — it only ever arrives via the deploy environment.
 */
export function readM365EnvConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): M365EnvConfig | null {
  const entra_tenant_id = env.M365_GRAPH_TENANT_ID?.trim();
  const client_id = env.M365_GRAPH_CLIENT_ID?.trim();
  const client_secret_plaintext = env.M365_GRAPH_CLIENT_SECRET?.trim();
  if (!entra_tenant_id || !client_id || !client_secret_plaintext) return null;
  return { entra_tenant_id, client_id, client_secret_plaintext };
}

/**
 * Idempotently provision the tenant's M365 Graph config from env, encrypting the
 * client secret with the current local crypto key. Safe to call on every seed:
 * a no-op when the env vars are unset, an upsert otherwise — so a DB reseed or a
 * crypto-key rotation self-heals the M365 link instead of needing a manual fix.
 */
export async function provisionM365FromEnv(args: {
  tenantId: string;
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
  log: Logger;
}): Promise<'provisioned' | 'skipped'> {
  const config = readM365EnvConfig(args.env);
  if (!config) {
    args.log.info(
      'M365 graph env not set (M365_GRAPH_TENANT_ID/CLIENT_ID/CLIENT_SECRET) — skipping M365 provisioning',
    );
    return 'skipped';
  }

  const keyProvider = await createKeyProviderFromEnv(parseCryptoEnv(args.env));
  const cryptoSvc = createCrypto({ keyProvider, log: args.log.child({ component: 'crypto' }) });

  await setM365TenantConfig({
    tenantId: args.tenantId,
    actor: {
      user_id: 0,
      tenantId: args.tenantId,
      permissions: new Set<string>([INTEGRATIONS_PERMISSIONS.m365Configure]),
    },
    input: config,
    crypto: { encrypt: (p) => cryptoSvc.encrypt(p) },
  });

  args.log.info(
    { tenantId: args.tenantId, client_id: config.client_id },
    'M365 tenant config provisioned from env',
  );
  return 'provisioned';
}
