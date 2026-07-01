import { and, eq } from 'drizzle-orm';
import { argon2id } from '../argon2.ts';
import { identityDb } from '../db/index.ts';
import { account, user } from '../db/schema.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import { credentialAccountValues } from './_credential.ts';
import type { Actor } from './create-user.ts';

export interface EnsureLocalLoginInput {
  user_id: string;
  tenant_id: string;
  password: string;
}

/**
 * Idempotently give an existing user a usable local (password) login: marks the
 * email verified and upserts the better-auth credential `account` row. Re-running
 * for the same user is safe — it updates the stored hash rather than erroring.
 *
 * This is the credentialing half of subscriber-driven provisioning: `provisionLogin`
 * (or the auto-provision subscriber) mints the credential-less user, then this attaches
 * a password. Unlike `createUser` it never creates the user and never fails on an
 * existing account, so it composes with concurrent provisioning instead of racing it.
 */
export async function ensureLocalLogin(input: EnsureLocalLoginInput, actor: Actor): Promise<void> {
  if (actor.type === 'user') {
    if (!actor.user_id) throw new IdentityError('FORBIDDEN', 'user actor requires user_id');
    await requirePermission(actor.user_id, 'identity.user.write', input.tenant_id);
  }

  // CLI is a trusted internal actor; only enforce the floor for web/user-submitted passwords.
  const minLen = actor.type === 'cli' ? 1 : 12;
  if (input.password.length < minLen || input.password.length > 128) {
    throw new IdentityError('PASSWORD_LENGTH', 'Password must be 12-128 characters.');
  }

  const passwordHash = await argon2id.hash(input.password);

  await identityDb().transaction(async (tx) => {
    const verified = await tx
      .update(user)
      .set({ email_verified: true, updated_at: new Date() })
      .where(and(eq(user.id, input.user_id), eq(user.tenant_id, input.tenant_id)))
      .returning({ id: user.id });
    if (verified.length === 0) {
      throw new IdentityError('NOT_FOUND', 'user not found in tenant');
    }

    const [existing] = await tx
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.user_id, input.user_id), eq(account.provider_id, 'credential')))
      .limit(1);

    if (existing) {
      await tx
        .update(account)
        .set({ password: passwordHash, updated_at: new Date() })
        .where(and(eq(account.user_id, input.user_id), eq(account.provider_id, 'credential')));
    } else {
      await tx.insert(account).values(credentialAccountValues(input.user_id, passwordHash));
    }
  });
}
