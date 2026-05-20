import { z } from 'zod';
import { IdentityError } from '../rbac.ts';
import type { Actor } from './create-user.ts';
import { updateUserProfile } from './update-user-profile.ts';

const Input = z.object({
  displayName: z.string().trim().min(1, 'display name must not be empty').max(120),
});
export type UpdateMyDisplayNameInput = z.infer<typeof Input>;

export async function updateMyDisplayName(
  actor: Actor,
  input: UpdateMyDisplayNameInput,
): Promise<void> {
  if (actor.type !== 'user' || !actor.user_id) {
    throw new IdentityError('FORBIDDEN', 'unauthenticated: actor must be an authenticated user');
  }
  const parsed = Input.parse(input);
  await updateUserProfile(actor.user_id, { display_name: parsed.displayName }, actor);
}
