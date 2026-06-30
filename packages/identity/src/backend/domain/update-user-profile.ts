import { emit, withEmit } from '@seta/core/events';
import { eq } from 'drizzle-orm';
import { user } from '../db/schema.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import type { Actor } from './create-user.ts';
import { getUserProfile, type UserProfile } from './get-user-profile.ts';
import { requireUserExists } from './helpers.ts';

// Identity owns the account only — the sole mutable account field here is the
// display name (HR fields moved to People's /me surface). Kept under this name
// so the display-name delegators (update-my-display-name, link-sso-account,
// sync-login-identity) keep working.
export interface UpdateUserProfilePatch {
  display_name?: string;
}

export async function updateUserProfile(
  userId: string,
  patch: UpdateUserProfilePatch,
  actor: Actor,
): Promise<UserProfile> {
  const target = await requireUserExists(userId);

  if (actor.type === 'user') {
    if (!actor.user_id) throw new IdentityError('FORBIDDEN', 'user actor requires user_id');
    if (actor.user_id !== userId) {
      await requirePermission(actor.user_id, 'identity.user.write', target.tenant_id);
    }
  }

  const before = await getUserProfile(userId);
  if (!before) throw new IdentityError('USER_NOT_FOUND', userId);

  if (patch.display_name === undefined || patch.display_name === before.display_name) {
    return before;
  }

  await withEmit(
    {
      actor: {
        userId: actor.user_id ?? 'system',
        tenantId: target.tenant_id,
        ip: actor.ip,
        userAgent: actor.user_agent,
      },
    },
    async (tx) => {
      await tx
        .update(user)
        .set({ name: patch.display_name, updated_at: new Date() })
        .where(eq(user.id, userId));

      await emit({
        tenantId: target.tenant_id,
        aggregateType: 'identity.user',
        aggregateId: userId,
        eventType: 'identity.user.profile.updated',
        eventVersion: 1,
        payload: {
          actor: {
            type: actor.type,
            user_id: actor.user_id,
            ip: actor.ip,
            user_agent: actor.user_agent,
          },
          user_id: userId,
          before: { display_name: before.display_name },
          after: { display_name: patch.display_name },
        },
      });
    },
  );

  const after = await getUserProfile(userId);
  if (!after) throw new IdentityError('USER_NOT_FOUND', userId);
  return after;
}
