import { eq } from 'drizzle-orm';
import { coreDb } from '../db/client.ts';
import { sessionScopeCache } from '../db/schema/index.ts';
import { evictHotByUser } from './scope.ts';

export async function invalidateUserSessions(userId: string): Promise<void> {
  await coreDb()
    .update(sessionScopeCache)
    .set({ invalidated_at: new Date() })
    .where(eq(sessionScopeCache.user_id, userId));
  evictHotByUser(userId);
}
