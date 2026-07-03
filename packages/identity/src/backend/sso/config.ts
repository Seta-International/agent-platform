import { z } from 'zod';

export type SsoProviderId = 'microsoft-entra-id';

// Entra tenant id is NOT stored here: it lives in the tenant_sso_providers.entra_tenant_id
// column, owned solely by integrations (projected via the entra-linkage subscriber). `config`
// holds only admin-controlled consent metadata.
export interface MicrosoftEntraConfig {
  consent_granted_at: string | null;
  consent_granted_by_oid: string | null;
  consent_granted_by_email: string | null;
}

export const microsoftEntraConfigSchema = z.object({
  consent_granted_at: z.string().datetime().nullable(),
  consent_granted_by_oid: z.string().nullable(),
  consent_granted_by_email: z.string().email().nullable(),
}) satisfies z.ZodType<MicrosoftEntraConfig>;

export type ProviderConfig = MicrosoftEntraConfig;
