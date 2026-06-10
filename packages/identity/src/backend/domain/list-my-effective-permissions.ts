import { resolveForRoles } from '../rbac-registry.ts';
import type { Actor } from './create-user.ts';
import { getUserGrants } from './get-user-grants.ts';

export async function listMyEffectivePermissions(actor: Actor): Promise<string[]> {
  if (actor.type !== 'user' || !actor.user_id) return [];
  const grants = await getUserGrants(actor.user_id);
  return [...resolveForRoles(grants.map((g) => g.role_slug))].sort();
}
