// rbac: user-self-scoped — returns the actor's own profile or null. Authentication
// already happened in the session middleware; this is a session-bound read.
import type { Actor } from './create-user.ts';
import { getUserProfile, type UserProfile } from './get-user-profile.ts';

export async function whoAmI(actor: Actor): Promise<UserProfile | null> {
  if (actor.type !== 'user' || !actor.user_id) return null;
  return getUserProfile(actor.user_id);
}
