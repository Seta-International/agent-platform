import { eq } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';
import { user } from '../../db/schema.ts';
import { IdentityError } from '../rbac.ts';

export async function requireUserExists(
  userId: string,
): Promise<{ tenant_id: string; email: string; name: string; deactivated_at: Date | null }> {
  const [u] = await identityDb()
    .select({
      tenant_id: user.tenant_id,
      email: user.email,
      name: user.name,
      deactivated_at: user.deactivated_at,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!u) throw new IdentityError('USER_NOT_FOUND', `No user with id ${userId}`);
  return u;
}
