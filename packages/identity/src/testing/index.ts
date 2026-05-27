import type { Pool } from 'pg';
import { createUser } from '../backend/domain/create-user.ts';

export async function createTestTenantWithAdmin(opts: {
  pool: Pool;
  name?: string;
  slug?: string;
  adminEmail?: string;
  adminPassword?: string;
}): Promise<{ tenant_id: string; admin_user_id: string }> {
  const tenant_id = crypto.randomUUID();
  const name = opts.name ?? 'Demo';
  const slug = opts.slug ?? 'demo';
  await opts.pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
    tenant_id,
    name,
    slug,
  ]);
  const { user_id } = await createUser(
    {
      tenant_id,
      email: opts.adminEmail ?? 'admin@demo.local',
      name: 'Admin',
      password: opts.adminPassword ?? 'ChangeMe@2026',
      initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
    },
    { type: 'cli', user_id: null },
  );
  return { tenant_id, admin_user_id: user_id };
}

export { resetIdentityDb } from '../backend/db/index.ts';
