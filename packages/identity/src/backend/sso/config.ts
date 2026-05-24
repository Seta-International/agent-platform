import { z } from 'zod';

export type SsoProviderId = 'microsoft-entra-id';

export interface MicrosoftEntraConfig {
  entra_tenant_id: string;
  consent_granted_at: string | null;
  consent_granted_by_oid: string | null;
  consent_granted_by_email: string | null;
}

export const microsoftEntraConfigSchema = z.object({
  entra_tenant_id: z.string().uuid(),
  consent_granted_at: z.string().datetime().nullable(),
  consent_granted_by_oid: z.string().nullable(),
  consent_granted_by_email: z.string().email().nullable(),
}) satisfies z.ZodType<MicrosoftEntraConfig>;

export type ProviderConfig = MicrosoftEntraConfig;
