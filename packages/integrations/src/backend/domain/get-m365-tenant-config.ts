import type { EncryptedBlob } from '@seta/shared-crypto';
import { eq } from 'drizzle-orm';
import { integrationsDb } from '../../db/client.ts';
import { m365TenantConfig } from '../../db/schema/index.ts';

export interface DecryptedM365TenantConfig {
  entra_tenant_id: string;
  client_id: string;
  client_secret_plaintext: string;
}

export async function getM365TenantConfig(
  tenantId: string,
  deps: { crypto: { decrypt(blob: EncryptedBlob): Promise<string> } },
): Promise<DecryptedM365TenantConfig | null> {
  const [row] = await integrationsDb()
    .select()
    .from(m365TenantConfig)
    .where(eq(m365TenantConfig.tenantId, tenantId))
    .limit(1);
  if (!row?.enabled) return null;
  const plaintext = await deps.crypto.decrypt(row.clientSecretBlob);
  return {
    entra_tenant_id: row.entraTenantId,
    client_id: row.clientId,
    client_secret_plaintext: plaintext,
  };
}
