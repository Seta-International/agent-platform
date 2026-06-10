import type { Pool } from 'pg';
import { createUser } from '../../src/backend/domain/create-user.ts';

export interface SeededTenant {
  tenant_id: string;
  admin: string;
  users: string[];
}

/**
 * Seed a tenant with an org.admin actor and `n` plain member users.
 * Requires `initPools` to already be configured (createUser uses the worker pool).
 */
export async function seedTenantWithUsers(pool: Pool, n: number): Promise<SeededTenant> {
  const tenant_id = crypto.randomUUID();
  const tag = tenant_id.slice(0, 8);
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Demo', $2)`, [
    tenant_id,
    `demo-${tag}`,
  ]);

  const { user_id: admin } = await createUser(
    {
      tenant_id,
      email: `admin-${tag}@d.local`,
      name: 'Admin',
      password: 'ChangeMe@2026',
      initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
    },
    { type: 'cli', user_id: null },
  );

  const users: string[] = [];
  for (let i = 0; i < n; i++) {
    const { user_id } = await createUser(
      { tenant_id, email: `u${i}-${tag}@d.local`, name: `U${i}`, password: 'ChangeMe@2026' },
      { type: 'cli', user_id: null },
    );
    users.push(user_id);
  }

  return { tenant_id, admin, users };
}
