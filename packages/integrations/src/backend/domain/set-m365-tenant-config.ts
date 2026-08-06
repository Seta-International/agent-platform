import { emit, withEmit } from '@seta/core/events';
import type { EncryptedBlob } from '@seta/shared-crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { m365TenantConfig } from '../db/schema/index.ts';
import { INTEGRATIONS_PERMISSIONS, IntegrationsError, requirePermission } from '../rbac.ts';
import type { Actor } from './get-mail-transport-config.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const inputSchema = z.object({
  entra_tenant_id: z.string().uuid(),
  client_id: z.string().min(1),
  // Entra's "Certificates & secrets" blade puts a Secret *ID* (a UUID) next to the secret *Value*,
  // and shows the Value only once at creation — so pasting the ID is the common misconfiguration.
  // A UUID is never a valid secret Value, and accepting one only defers the failure to token time,
  // where it surfaces as an opaque AADSTS7000215 long after whoever configured it has moved on.
  client_secret_plaintext: z
    .string()
    .min(1)
    .refine((s) => !UUID_RE.test(s.trim()), {
      message:
        'client_secret_plaintext looks like an Entra Secret ID (a UUID), not a secret Value. Copy the "Value" column from Certificates & secrets — it is shown only once, so create a new client secret if it is already masked.',
    }),
});

export type SetM365TenantConfigInput = z.infer<typeof inputSchema>;

export interface SetM365TenantConfigArgs {
  tenantId: string;
  actor: Actor;
  input: SetM365TenantConfigInput;
  crypto: { encrypt(plaintext: string): Promise<EncryptedBlob> };
}

export async function setM365TenantConfig(args: SetM365TenantConfigArgs): Promise<void> {
  requirePermission(args.actor, INTEGRATIONS_PERMISSIONS.m365Configure);
  if (args.actor.tenantId !== args.tenantId)
    throw new IntegrationsError('FORBIDDEN', 'tenant mismatch');

  const parsed = inputSchema.safeParse(args.input);
  if (!parsed.success) throw new IntegrationsError('INVALID_INPUT', parsed.error.message);

  const secretBlob = await args.crypto.encrypt(parsed.data.client_secret_plaintext);

  await withEmit({ actor: { userId: args.actor.user_id, tenantId: args.tenantId } }, async (tx) => {
    await tx
      .insert(m365TenantConfig)
      .values({
        tenantId: args.tenantId,
        entraTenantId: parsed.data.entra_tenant_id,
        clientId: parsed.data.client_id,
        clientSecretBlob: secretBlob,
        enabled: true,
        createdBy: args.actor.user_id,
        updatedBy: args.actor.user_id,
      })
      .onConflictDoUpdate({
        target: m365TenantConfig.tenantId,
        set: {
          entraTenantId: parsed.data.entra_tenant_id,
          clientId: parsed.data.client_id,
          clientSecretBlob: secretBlob,
          enabled: true,
          updatedAt: sql`now()`,
          updatedBy: args.actor.user_id,
        },
      });
    await emit({
      tenantId: args.tenantId,
      aggregateType: 'm365_tenant_config',
      aggregateId: args.tenantId,
      eventType: 'integrations.m365_tenant_config.set',
      eventVersion: 1,
      payload: {
        entra_tenant_id: parsed.data.entra_tenant_id,
        client_id: parsed.data.client_id,
      },
    });
    // Projection event: integrations is the sole owner of the tenant↔Entra linkage;
    // identity's entra-linkage subscriber mirrors entra_tenant_id into tenant_sso_providers.
    await emit({
      tenantId: args.tenantId,
      aggregateType: 'integrations.m365_tenant_config',
      aggregateId: args.tenantId,
      eventType: 'integrations.m365_tenant_config.updated',
      eventVersion: 1,
      payload: {
        entraTenantId: parsed.data.entra_tenant_id,
        enabled: true,
      },
    });
  });
}
