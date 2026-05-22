import { withEmit } from '@seta/core/events';
import { and, eq, ne, sql } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';
import { account, user } from '../../db/schema.ts';
import { emitIdentityUserEmailChanged } from '../../events/index.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import { toEmitActor, toEventActor } from '../sso/helpers.ts';
import { isValidEmail } from './_email.ts';
import type { Actor } from './create-user.ts';

export interface ChangeUserEmailInput {
  user_id: string;
  new_email: string;
  reason: 'admin' | 'sso_sync';
}

export async function changeUserEmail(
  input: ChangeUserEmailInput,
  actor: Actor,
): Promise<{ old_email: string; new_email: string }> {
  const [target] = await identityDb()
    .select({ tenant_id: user.tenant_id, email: user.email })
    .from(user)
    .where(eq(user.id, input.user_id))
    .limit(1);
  if (!target) throw new IdentityError('USER_NOT_FOUND', `No user with id ${input.user_id}`);

  const newEmail = input.new_email.toLowerCase().trim();
  if (!isValidEmail(newEmail)) {
    throw new IdentityError('INVALID_EMAIL', `Not a valid email: ${newEmail}`);
  }

  if (input.reason === 'admin') {
    if (actor.type === 'user') {
      if (!actor.user_id) throw new IdentityError('FORBIDDEN', 'user actor requires user_id');
      await requirePermission(actor.user_id, 'identity.user.email.change', target.tenant_id);
    }
    const [ext] = await identityDb()
      .select({ provider_id: account.provider_id })
      .from(account)
      .where(and(eq(account.user_id, input.user_id), ne(account.provider_id, 'credential')))
      .limit(1);
    if (ext) {
      throw new IdentityError(
        'EMAIL_MANAGED_BY_SSO',
        `This user's email is managed by ${ext.provider_id}`,
      );
    }
  }

  // Raw comparison (not lower(target.email)): newEmail is already lowercased above,
  // so a mixed-case stored value falls through to the update path and gets normalized.
  if (newEmail === target.email) {
    return { old_email: target.email, new_email: target.email };
  }

  const [conflict] = await identityDb()
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        eq(user.tenant_id, target.tenant_id),
        sql`lower(${user.email}) = ${newEmail}`,
        ne(user.id, input.user_id),
      ),
    )
    .limit(1);
  if (conflict) {
    throw new IdentityError('EMAIL_TAKEN', `Another active user already has email ${newEmail}`);
  }

  await withEmit({ actor: toEmitActor(actor, target.tenant_id) }, async (tx) => {
    await tx
      .update(user)
      .set({ email: newEmail, updated_at: new Date() })
      .where(eq(user.id, input.user_id));
    await emitIdentityUserEmailChanged({
      actor: toEventActor(actor),
      user_id: input.user_id,
      tenant_id: target.tenant_id,
      old_email: target.email,
      new_email: newEmail,
      reason: input.reason,
    });
  });

  return { old_email: target.email, new_email: newEmail };
}
