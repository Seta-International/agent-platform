import { and, eq, isNull } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';
import { user, userProfile } from '../../db/schema.ts';

export interface UserProfileForEmbedding {
  skills: string[];
}

export async function getUserProfileForEmbedding(input: {
  tenant_id: string;
  user_id: string;
}): Promise<UserProfileForEmbedding | null> {
  const [row] = await identityDb()
    .select({
      skills: userProfile.skills,
    })
    .from(user)
    .innerJoin(userProfile, eq(userProfile.user_id, user.id))
    .where(
      and(
        eq(user.id, input.user_id),
        eq(user.tenant_id, input.tenant_id),
        isNull(user.deactivated_at),
      ),
    )
    .limit(1);
  if (!row) return null;
  return row as UserProfileForEmbedding;
}
