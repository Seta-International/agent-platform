import { getSessionScope, type SessionScope } from '@seta/core';
import { listRoleGrants, whoAmI } from '@seta/identity';

/**
 * Builds a SessionScope for a Mastra actor.
 * Uses a deterministic session_id so the LRU cache in getSessionScope is effective.
 */
export async function buildActorSession(actor: { user_id: string }): Promise<SessionScope> {
  const sessionId = `tool-actor:${actor.user_id}`;

  const profile = await whoAmI({ type: 'user', user_id: actor.user_id });

  return await getSessionScope(
    { listRoleGrants },
    sessionId,
    actor.user_id,
    profile?.email ?? '',
    profile?.display_name ?? '',
  );
}
