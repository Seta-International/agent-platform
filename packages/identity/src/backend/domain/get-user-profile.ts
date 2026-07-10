import { eq } from 'drizzle-orm';
import { identityAuthDb } from '../db/index.ts';
import { user } from '../db/schema.ts';

// Identity owns the account only. HR fields (presence, skills, bio, job role)
// live in People — read them via People's public surface, not here.
export interface UserProfile {
  user_id: string;
  tenant_id: string;
  display_name: string;
  email: string;
  updated_at: Date;
  deactivated_at: Date | null;
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const [row] = await identityAuthDb()
    .select({
      user_id: user.id,
      tenant_id: user.tenant_id,
      display_name: user.name,
      email: user.email,
      deactivated_at: user.deactivated_at,
      updated_at: user.updated_at,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!row) return null;
  return row;
}
