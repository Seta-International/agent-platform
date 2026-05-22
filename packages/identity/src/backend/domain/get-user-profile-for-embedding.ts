import { and, eq, isNull } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';
import { user, userProfile } from '../../db/schema.ts';

export interface UserProfileForEmbedding {
  name: string;
  role: string;
  skills: string[];
}

const ROLE_FALLBACK = 'team member';

export async function getUserProfileForEmbedding(input: {
  tenant_id: string;
  user_id: string;
}): Promise<UserProfileForEmbedding | null> {
  const [row] = await identityDb()
    .select({
      name: user.name,
      role: userProfile.role,
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
  return {
    name: row.name,
    role: row.role ?? ROLE_FALLBACK,
    skills: row.skills,
  };
}
