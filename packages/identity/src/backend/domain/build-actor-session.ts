import { getSessionScope, type SessionScope } from '@seta/core';
import { resolveForRoles } from '../rbac-registry.ts';
import { listRoleGrants } from './list-role-grants.ts';
import { whoAmI } from './who-am-i.ts';

/**
 * Builds a SessionScope for an agent-tool actor. Deterministic session_id keeps
 * the LRU cache inside getSessionScope effective across back-to-back tool calls.
 */
export async function buildActorSession(actor: { user_id: string }): Promise<SessionScope> {
  const sessionId = `tool-actor:${actor.user_id}`;

  const profile = await whoAmI({ type: 'user', user_id: actor.user_id });

  return await getSessionScope(
    { listRoleGrants, resolvePermissions: resolveForRoles },
    sessionId,
    actor.user_id,
    profile?.email ?? '',
    profile?.display_name ?? '',
  );
}
