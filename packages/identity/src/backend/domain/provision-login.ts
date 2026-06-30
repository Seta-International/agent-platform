// rbac: system-only — called by the auto-provision subscriber and provisionAccount; tenant scope comes from input.tenant_id.
import { emit, withEmit } from '@seta/core/events';
import { and, eq, sql } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import { accessGroup, user } from '../db/schema.ts';
import { IdentityError } from '../rbac.ts';
import { isValidEmail } from './_email.ts';
import type { Actor } from './create-user.ts';
import { addGroupMembers } from './group-membership.ts';

export interface ProvisionLoginInput {
  tenant_id: string;
  email: string;
  name: string;
}

/**
 * People-driven login provisioning. Mints an `identity.user` satellite with NO
 * credential account — the credential is established on first use (SSO link, or
 * the createUser invite knob). Idempotent on (tenant_id, lower(email)).
 */
export async function provisionLogin(
  input: ProvisionLoginInput,
  actor: Actor,
): Promise<{ user_id: string; created: boolean }> {
  const email = input.email.toLowerCase().trim();
  if (!isValidEmail(email)) throw new IdentityError('INVALID_EMAIL', `Not a valid email: ${email}`);

  // Deliberately broader than the partial unique index (user_tenant_email_uniq is
  // WHERE deactivated_at IS NULL): matching deactivated rows too makes re-provision
  // return the existing satellite instead of inserting a duplicate. Do not narrow.
  const [existing] = await identityDb()
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.tenant_id, input.tenant_id), sql`lower(${user.email}) = ${email}`))
    .limit(1);
  if (existing) {
    await ensureBaseMembership(input.tenant_id, existing.id, actor);
    return { user_id: existing.id, created: false };
  }

  // The pre-SELECT above is a fast-path, not a guard: a concurrent provisionLogin
  // (at-least-once redelivery) or createUser can insert the same (tenant, email)
  // between our SELECT and this INSERT. Make the insert itself the arbiter via
  // ON CONFLICT DO NOTHING. We can't name the conflict target — user_tenant_email_uniq
  // is a partial expression index `(tenant_id, lower(email)) WHERE deactivated_at IS NULL`,
  // which Drizzle's typed/runtime target (plain columns only) can't express — but a bare
  // DO NOTHING is exact here: `id` is a fresh UUID, so that partial index is the only
  // arbiter a new active row can conflict on. DO NOTHING (vs. a 23505 catch) keeps the
  // outbox transaction un-aborted, so the re-SELECT on the conflict branch stays valid.
  const newUserId = crypto.randomUUID();
  let resolvedUserId: string = newUserId;
  let created = false;
  await withEmit(
    { actor: { userId: actor.user_id ?? 'system', tenantId: input.tenant_id } },
    async (tx) => {
      const inserted = await tx
        .insert(user)
        .values({
          id: newUserId,
          email,
          name: input.name,
          email_verified: false,
          tenant_id: input.tenant_id,
        })
        .onConflictDoNothing()
        .returning({ id: user.id });

      if (inserted.length === 0) {
        // A concurrent caller won the race and owns this user (its user.created).
        // Re-resolve the winner's id and return created:false — do not emit a
        // phantom user.created.
        const [winner] = await tx
          .select({ id: user.id })
          .from(user)
          .where(and(eq(user.tenant_id, input.tenant_id), sql`lower(${user.email}) = ${email}`))
          .limit(1);
        if (!winner) {
          throw new IdentityError(
            'PROVISION_RACE',
            'provisionLogin: insert conflicted but no matching user row found',
          );
        }
        resolvedUserId = winner.id;
        return;
      }

      created = true;
      await emit({
        tenantId: input.tenant_id,
        aggregateType: 'identity.user',
        aggregateId: newUserId,
        eventType: 'identity.user.created',
        eventVersion: 1,
        payload: {
          actor: {
            type: actor.type,
            user_id: actor.user_id,
            ip: actor.ip,
            user_agent: actor.user_agent,
          },
          after: {
            user_id: newUserId,
            tenant_id: input.tenant_id,
            email,
            name: input.name,
            created_via: 'people',
          },
        },
      });
    },
  );
  await ensureBaseMembership(input.tenant_id, resolvedUserId, actor);

  return { user_id: resolvedUserId, created };
}

async function ensureBaseMembership(tenantId: string, userId: string, actor: Actor): Promise<void> {
  const [base] = await identityDb()
    .select({ id: accessGroup.id })
    .from(accessGroup)
    .where(and(eq(accessGroup.tenant_id, tenantId), eq(accessGroup.is_base, true)))
    .limit(1);
  if (base) {
    await addGroupMembers({ group_id: base.id, tenant_id: tenantId, user_ids: [userId] }, actor);
  }
}
