import { emit, withEmit } from '@seta/core/events';
import type { NodeTx } from '@seta/shared-db';
import { sql } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import { graphGetDomains } from '../sso/graph.ts';
import { getProviderRow, toEmitActor, toEventActor } from '../sso/helpers.ts';
import type { Actor } from './create-user.ts';

// Serializes the check-then-write below (see rejectIfDomainsTaken's second call site):
// two concurrent callers claiming the same domain for different tenants must not both pass
// the conflict check before either commits. A fixed advisory-lock key applied inside the
// write transaction turns "check, then write" into an atomic unit for this one operation —
// unrelated writes elsewhere are unaffected, and the lock auto-releases at commit/rollback.
const EMAIL_DOMAINS_LOCK_KEY = sql`hashtext('core.tenants.email_domains')::bigint`;

async function rejectIfDomainsTaken(
  db: ReturnType<typeof identityDb> | NodeTx,
  tenantId: string,
  normalized: string[],
): Promise<void> {
  const conflicts = await db.execute<{ id: string }>(sql`
    SELECT id FROM core.tenants -- cross-schema-read: core.tenants is owned by core; identity reads it for domain routing.
    WHERE id <> ${tenantId}
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
}

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
    // Fast pre-flight check (not itself race-safe — see the locked re-check right before the
    // write, below) so an obviously-taken domain fails before paying for a Graph round-trip.
    await rejectIfDomainsTaken(identityDb(), args.tenant_id, normalized);

    // When the tenant has an Entra provider, every domain must be verified in the Entra tenant.
    // Fail CLOSED if the linkage isn't projected in yet: we cannot verify domain ownership without
    // the Entra tenant id, so we must not persist unverified domains (mirrors the fail-closed guards
    // in sso-consent.ts / list-entra-importable-users.ts). Only genuinely non-Entra tenants (no
    // provider row) skip verification.
    const provider = await getProviderRow(args.tenant_id, 'microsoft-entra-id');
    if (provider) {
      if (!provider.entra_tenant_id) {
        throw new IdentityError(
          'M365_NOT_CONFIGURED',
          'Entra tenant linkage not set; configure the Microsoft 365 integration before setting email domains.',
        );
      }
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

  await withEmit({ actor: toEmitActor(actor, args.tenant_id) }, async (tx: NodeTx) => {
    if (normalized.length > 0) {
      // Close the race: hold the lock for exactly the check-and-write below, on the same
      // transaction (`tx`, not a separate identityDb() connection) so a concurrent caller
      // claiming the same domain either sees this write committed (and gets DOMAIN_TAKEN
      // from its own re-check) or is blocked until this transaction ends.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${EMAIL_DOMAINS_LOCK_KEY})`);
      await rejectIfDomainsTaken(tx, args.tenant_id, normalized);
    }

    // Raw SQL to update core.tenants — identity reaches across schemas by SQL,
    // not by importing core's Drizzle client (preserves modular-monolith boundary).
    if (normalized.length === 0) {
      // sql.join on an empty array produces invalid SQL — write the literal instead.
      await tx.execute(sql`
        UPDATE core.tenants SET email_domains = '{}'::text[] WHERE id = ${args.tenant_id}
      `);
    } else {
      await tx.execute(sql`
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
