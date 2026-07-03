import type { DomainEvent, SubscriberCtx, SubscriberDef } from '@seta/shared-types';

// ── Local payload type ───────────────────────────────────────────────────────

interface M365TenantConfigUpdatedPayload {
  entraTenantId: string;
  enabled: boolean;
}

// ── pgClient helper (mirrors directory-projection) ───────────────────────────

function pgClient(tx: SubscriberCtx['tx']): {
  query(text: string, values?: unknown[]): Promise<unknown>;
} {
  const session = (tx as unknown as { session?: { client?: unknown } }).session;
  if (session?.client) {
    return session.client as { query(text: string, values?: unknown[]): Promise<unknown> };
  }
  return tx as unknown as { query(text: string, values?: unknown[]): Promise<unknown> };
}

// ── Subscriber ───────────────────────────────────────────────────────────────

const projectEntraLinkage: SubscriberDef = {
  subscription: 'identity.entra-linkage.project-m365-tenant-config',
  event: 'integrations.m365_tenant_config.updated',
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<M365TenantConfigUpdatedPayload>;
    // Integrations owns the tenant↔Entra linkage; project only entra_tenant_id here.
    // On conflict we deliberately touch ONLY entra_tenant_id + updated_at: `enabled` and
    // `config` stay admin-controlled (SSO enable/disable and consent metadata are a separate
    // concern from the Entra tenant linkage). The payload's `enabled` is intentionally NOT used
    // to flip identity's SSO `enabled` flag. On first insert (no admin row yet) we seed a
    // disabled, empty-config row so the linkage is recorded ahead of admin registration.
    // Idempotent by construction; safe to replay per the at-least-once subscriber contract.
    await pgClient(ctx.tx).query(
      `INSERT INTO identity.tenant_sso_providers (tenant_id, provider_id, entra_tenant_id, enabled, config)
       VALUES ($1, 'microsoft-entra-id', $2, false, '{}'::jsonb)
       ON CONFLICT (tenant_id, provider_id) DO UPDATE SET
         entra_tenant_id = EXCLUDED.entra_tenant_id,
         updated_at = now()`,
      [e.tenantId, e.payload.entraTenantId],
    );
  },
};

export const entraLinkageSubscribers: SubscriberDef[] = [projectEntraLinkage];
