import { emit, withEmit } from '@seta/core/events';
import { eq } from 'drizzle-orm';
import { user, userProfile } from '../../db/schema.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import type { Actor } from './create-user.ts';
import { getUserProfile, type UserProfile } from './get-user-profile.ts';
import { requireUserExists } from './helpers.ts';

export interface UpdateUserProfilePatch {
  display_name?: string;
  availability_status?: 'available' | 'busy' | 'ooo';
  ooo_until?: Date | null;
  timezone?: string;
  skills?: ReadonlyArray<string>;
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

  const normalizedSkills =
    patch.skills !== undefined
      ? Array.from(
          new Set(patch.skills.map((s) => s.toLowerCase().trim()).filter((s) => s.length > 0)),
        ).sort()
      : undefined;

  const diffBefore: Record<string, unknown> = {};
  const diffAfter: Record<string, unknown> = {};

  if (patch.display_name !== undefined && patch.display_name !== before.display_name) {
    diffBefore.display_name = before.display_name;
    diffAfter.display_name = patch.display_name;
  }
  if (
    patch.availability_status !== undefined &&
    patch.availability_status !== before.availability_status
  ) {
    diffBefore.availability_status = before.availability_status;
    diffAfter.availability_status = patch.availability_status;
  }
  if (
    patch.ooo_until !== undefined &&
    (before.ooo_until?.toISOString() ?? null) !== (patch.ooo_until?.toISOString() ?? null)
  ) {
    diffBefore.ooo_until = before.ooo_until?.toISOString() ?? null;
    diffAfter.ooo_until = patch.ooo_until?.toISOString() ?? null;
  }
  if (patch.timezone !== undefined && patch.timezone !== before.timezone) {
    diffBefore.timezone = before.timezone;
    diffAfter.timezone = patch.timezone;
  }
  if (
    normalizedSkills !== undefined &&
    JSON.stringify(normalizedSkills) !== JSON.stringify([...before.skills].sort())
  ) {
    diffBefore.skills = [...before.skills];
    diffAfter.skills = normalizedSkills;
  }

  if (Object.keys(diffAfter).length === 0) return before;

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
      if (patch.display_name !== undefined) {
        await tx
          .update(user)
          .set({ name: patch.display_name, updated_at: new Date() })
          .where(eq(user.id, userId));
      }

      const profilePatch: Record<string, unknown> = { updated_at: new Date() };
      if (patch.availability_status !== undefined)
        profilePatch.availability_status = patch.availability_status;
      if (patch.ooo_until !== undefined) profilePatch.ooo_until = patch.ooo_until;
      if (patch.timezone !== undefined) profilePatch.timezone = patch.timezone;
      if (normalizedSkills !== undefined) profilePatch.skills = normalizedSkills;

      if (Object.keys(profilePatch).length > 1) {
        await tx.update(userProfile).set(profilePatch).where(eq(userProfile.user_id, userId));
      }

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
          before: diffBefore,
          after: diffAfter,
        },
      });
    },
  );

  const after = await getUserProfile(userId);
  if (!after) throw new IdentityError('USER_NOT_FOUND', userId);
  return after;
}
