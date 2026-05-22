import { createUser } from '@seta/identity';
import type { Pool } from 'pg';

export interface SeedUserOptions {
  tenant_id?: string;
  skills?: string[];
}

export interface SeededUserWithProfile {
  tenant_id: string;
  user_id: string;
}

/**
 * Seed a user with a profile (including skills) for embedding/CDC tests.
 *
 * If `tenant_id` is omitted, a fresh tenant is created.
 * The user is created via createUser so all DB constraints are satisfied.
 * Skills are inserted directly into identity.user_profile.
 */
export async function seedUserWithSkillsForTest(
  pool: Pool,
  opts: SeedUserOptions = {},
): Promise<SeededUserWithProfile> {
  let tenant_id = opts.tenant_id;

  if (!tenant_id) {
    tenant_id = crypto.randomUUID();
    const slug = `t-${tenant_id.slice(0, 8)}`;
    await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
      tenant_id,
      `Test Tenant ${tenant_id.slice(0, 8)}`,
      slug,
    ]);
  }

  const email = `user-${crypto.randomUUID().slice(0, 8)}@test.local`;
  const { user_id } = await createUser(
    {
      tenant_id,
      email,
      name: 'Test User',
      password: 'correct-horse-battery-staple',
    },
    { type: 'cli', user_id: null },
  );

  if (opts.skills && opts.skills.length > 0) {
    await pool.query(`UPDATE identity.user_profile SET skills = $1 WHERE user_id = $2`, [
      opts.skills,
      user_id,
    ]);
  }

  return { tenant_id, user_id };
}
