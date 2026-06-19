// rbac: system-only — called from People setPortalAccess, which enforces people.worker.portal_access.set; tenant scope comes from input.tenant_id.
import { emit, withEmit } from '@seta/core/events';
import { and, eq, sql } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import { user, userProfile } from '../db/schema.ts';
import { IdentityError } from '../rbac.ts';
import { isValidEmail } from './_email.ts';
import type { Actor } from './create-user.ts';

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
  if (existing) return { user_id: existing.id, created: false };

  const userId = crypto.randomUUID();
  await withEmit(
    { actor: { userId: actor.user_id ?? 'system', tenantId: input.tenant_id } },
    async (tx) => {
      await tx.insert(user).values({
        id: userId,
        email,
        name: input.name,
        email_verified: false,
        tenant_id: input.tenant_id,
      });
      await tx.insert(userProfile).values({ user_id: userId, tenant_id: input.tenant_id });
      await emit({
        tenantId: input.tenant_id,
        aggregateType: 'identity.user',
        aggregateId: userId,
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
            user_id: userId,
            tenant_id: input.tenant_id,
            email,
            name: input.name,
            created_via: 'people',
          },
        },
      });
    },
  );
  return { user_id: userId, created: true };
}
