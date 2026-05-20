import { withEmit } from '@seta/core/events';
import { and, eq, sql } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';
import { account, user } from '../../db/schema.ts';
import { emitIdentityUserSsoLinked, emitIdentityUserSsoRevoked } from '../../events/index.ts';
import type { SsoProviderId } from '../../sso/config.ts';
import { toEmitActor, toEventActor } from '../sso/helpers.ts';
import { changeUserEmail } from './change-user-email.ts';
import type { Actor } from './create-user.ts';
import { updateUserProfile } from './update-user-profile.ts';

export interface LinkSsoAccountInput {
  tenant_id: string;
  provider_id: SsoProviderId;
  email: string;
  name: string;
  entra_oid: string;
  entra_tid: string;
}

export type LinkOutcome =
  | 'linked'
  | 'matched'
  | 'rejected_not_pre_provisioned'
  | 'rejected_deactivated'
  | 'rejected_oid_conflict';

export interface LinkSsoAccountResult {
  user_id: string | '';
  outcome: LinkOutcome;
}

export async function linkSsoAccount(
  input: LinkSsoAccountInput,
  actor: Actor,
): Promise<LinkSsoAccountResult> {
  const emailLower = input.email.toLowerCase().trim();

  const [u] = await identityDb()
    .select({
      user_id: user.id,
      current_name: user.name,
      current_email: user.email,
      deactivated_at: user.deactivated_at,
    })
    .from(user)
    .where(and(eq(user.tenant_id, input.tenant_id), sql`lower(${user.email}) = ${emailLower}`))
    .limit(1);

  if (!u) return { user_id: '', outcome: 'rejected_not_pre_provisioned' };

  if (u.deactivated_at) {
    await withEmit({ actor: toEmitActor(actor, input.tenant_id) }, async () => {
      await emitIdentityUserSsoRevoked({
        actor: toEventActor(actor),
        user_id: u.user_id,
        tenant_id: input.tenant_id,
        reason: 'user_deactivated',
      });
    });
    return { user_id: u.user_id, outcome: 'rejected_deactivated' };
  }

  const [existing] = await identityDb()
    .select({ account_id: account.account_id })
    .from(account)
    .where(and(eq(account.user_id, u.user_id), eq(account.provider_id, 'microsoft')))
    .limit(1);

  if (existing) {
    if (existing.account_id !== input.entra_oid) {
      return { user_id: u.user_id, outcome: 'rejected_oid_conflict' };
    }
    await syncProfileFromIdToken(u, input, actor);
    return { user_id: u.user_id, outcome: 'matched' };
  }

  await withEmit({ actor: toEmitActor(actor, input.tenant_id) }, async () => {
    await emitIdentityUserSsoLinked({
      actor: toEventActor(actor),
      user_id: u.user_id,
      tenant_id: input.tenant_id,
      entra_oid: input.entra_oid,
      entra_tid: input.entra_tid,
    });
  });

  await syncProfileFromIdToken(u, input, actor);
  return { user_id: u.user_id, outcome: 'linked' };
}

async function syncProfileFromIdToken(
  u: { user_id: string; current_name: string; current_email: string },
  input: LinkSsoAccountInput,
  actor: Actor,
): Promise<void> {
  if (input.name && input.name !== u.current_name) {
    await updateUserProfile(u.user_id, { display_name: input.name }, actor);
  }
  const wantEmail = input.email.toLowerCase();
  if (wantEmail !== u.current_email) {
    await changeUserEmail({ user_id: u.user_id, new_email: wantEmail, reason: 'sso_sync' }, actor);
  }
}
