import { emit, withEmit } from '@seta/core/events';
import { sql } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import { graphGetDomains } from '../sso/graph.ts';
import { getProviderRow, toEmitActor, toEventActor } from '../sso/helpers.ts';
import type { Actor } from './create-user.ts';

export async function setTenantEmailDomains(
  args: { tenant_id: string; email_domains: string[] },
  actor: Actor,
): Promise<string[]> {
  if (actor.type === 'user') {
    if (!actor.user_id) throw new IdentityError('FORBIDDEN', 'user actor requires user_id');
    await requirePermission(actor.user_id, 'core.tenant.email_domains.update', args.tenant_id);
  }

  const normalized = Array.from(
    new Set(args.email_domains.map((d) => d.toLowerCase().trim()).filter(Boolean)),
  ).sort();

  if (normalized.length > 0) {
    // Cross-tenant uniqueness (anti-takeover): no other tenant may claim these domains.
    const conflicts = await identityDb().execute<{ id: string }>(sql`
      SELECT id FROM core.tenants -- cross-schema-read: core.tenants is owned by core; identity reads it for domain routing.
      WHERE id <> ${args.tenant_id}
        AND email_domains && ARRAY[${sql.join(
          normalized.map((d) => sql`${d}`),
          sql`, `,
        )}]::text[]
      LIMIT 1
    `);
    if (conflicts.rows.length > 0) {
      throw new IdentityError(
        'DOMAIN_TAKEN',
        'One or more domains are already claimed by another tenant',
      );
    }

    // When the tenant has an Entra provider whose linkage is known, every domain must be
    // verified in the Entra tenant. If entra_tenant_id is not yet projected in from integrations,
    // skip Graph verification (nothing to verify against yet).
    const provider = await getProviderRow(args.tenant_id, 'microsoft-entra-id');
    if (provider?.entra_tenant_id) {
      const graphDomains = await graphGetDomains(provider.entra_tenant_id);
      const verified = new Set(
        graphDomains.filter((d) => d.isVerified).map((d) => d.id.toLowerCase()),
      );
      const unverified = normalized.filter((d) => !verified.has(d));
      if (unverified.length > 0) {
        throw new IdentityError(
          'DOMAIN_NOT_VERIFIED',
          `Domains not verified in Entra tenant: ${unverified.join(', ')}`,
        );
      }
    }
  }

  await withEmit({ actor: toEmitActor(actor, args.tenant_id) }, async () => {
    // Raw SQL to update core.tenants — identity reaches across schemas by SQL,
    // not by importing core's Drizzle client (preserves modular-monolith boundary).
    if (normalized.length === 0) {
      // sql.join on an empty array produces invalid SQL — write the literal instead.
      await identityDb().execute(sql`
        UPDATE core.tenants SET email_domains = '{}'::text[] WHERE id = ${args.tenant_id}
      `);
    } else {
      await identityDb().execute(sql`
        UPDATE core.tenants SET email_domains = ARRAY[${sql.join(
          normalized.map((d) => sql`${d}`),
          sql`, `,
        )}]::text[] WHERE id = ${args.tenant_id}
      `);
    }

    await emit({
      tenantId: args.tenant_id,
      aggregateType: 'core.tenant',
      aggregateId: args.tenant_id,
      eventType: 'core.tenant.email_domains.changed',
      eventVersion: 1,
      payload: {
        actor: toEventActor(actor),
        tenant_id: args.tenant_id,
        email_domains: normalized,
      },
    });
  });

  return normalized;
}
