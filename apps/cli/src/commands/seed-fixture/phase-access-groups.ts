import type { SessionScope } from '@seta/core';
import { ensurePersonaGroups } from '../lib/access-groups.ts';

export async function seedAccessGroups(session: SessionScope): Promise<Map<string, string>> {
  return ensurePersonaGroups(session, { type: 'cli', user_id: session.user_id });
}
