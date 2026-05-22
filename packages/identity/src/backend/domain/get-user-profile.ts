import { eq } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';
import { user, userProfile } from '../../db/schema.ts';

export interface UserProfile {
  user_id: string;
  tenant_id: string;
  display_name: string;
  email: string;
  availability_status: 'available' | 'busy' | 'ooo';
  ooo_until: Date | null;
  timezone: string;
  working_hours: { start: string; end: string } | null;
  skills: ReadonlyArray<string>;
  role: string | null;
  updated_at: Date;
  deactivated_at: Date | null;
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const [row] = await identityDb()
    .select({
      user_id: user.id,
      tenant_id: user.tenant_id,
      display_name: user.name,
      email: user.email,
      deactivated_at: user.deactivated_at,
      availability_status: userProfile.availability_status,
      ooo_until: userProfile.ooo_until,
      timezone: userProfile.timezone,
      working_hours: userProfile.working_hours,
      skills: userProfile.skills,
      role: userProfile.role,
      updated_at: userProfile.updated_at,
    })
    .from(user)
    .leftJoin(userProfile, eq(userProfile.user_id, user.id))
    .where(eq(user.id, userId))
    .limit(1);
  if (!row) return null;
  return row as UserProfile;
}
