import { changeUserEmail } from './change-user-email.ts';
import type { Actor } from './create-user.ts';
import { updateUserProfile } from './update-user-profile.ts';

export interface SyncLoginIdentityInput {
  user_id: string;
  email?: string;
  name?: string;
}

/** One-way push of People-authored email/name into the identity.user satellite. */
export async function syncLoginIdentity(
  input: SyncLoginIdentityInput,
  actor: Actor,
): Promise<void> {
  if (input.name !== undefined) {
    await updateUserProfile(input.user_id, { display_name: input.name }, actor);
  }
  if (input.email !== undefined) {
    await changeUserEmail(
      { user_id: input.user_id, new_email: input.email, reason: 'people_sync' },
      actor,
    );
  }
}
