import type { Pool } from 'pg';
import { identityDb } from '../../src/backend/db/index.ts';
import { directoryPerson } from '../../src/backend/db/schema.ts';
import { createUser } from '../../src/backend/domain/create-user.ts';

export interface SeededDirectoryAccount {
  person_id: string;
  user_id: string;
  tenant_id: string;
}

export interface SeededDirectoryPerson {
  person_id: string;
  tenant_id: string;
}

/**
 * Seed a directory_person row paired with a matching user account.
 * Creates a fresh tenant unless `tenant_id` is supplied.
 * Used by A1.5, A1.6, A1.7 integration tests.
 */
export async function seedDirectoryAccount(
  pool: Pool,
  opts: {
    email: string;
    admin: boolean;
    tenant_id?: string;
    suspended?: boolean;
  },
): Promise<SeededDirectoryAccount> {
  const tenant_id = opts.tenant_id ?? crypto.randomUUID();
  if (!opts.tenant_id) {
    const tag = tenant_id.slice(0, 8);
    await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
      tenant_id,
      `Seed Tenant ${tag}`,
      `seed-${tag}`,
    ]);
  }

  const person_id = crypto.randomUUID();
  await identityDb().insert(directoryPerson).values({
    person_id,
    tenant_id,
    full_name: 'Test Person',
    work_email: opts.email,
    employment_status: 'active',
  });

  const initial_role = opts.admin
    ? ({ role_slug: 'org.admin', scope_type: 'tenant' as const, scope_id: null } as const)
    : undefined;

  const { user_id } = await createUser(
    {
      tenant_id,
      email: opts.email,
      name: 'Test Person',
      password: 'S3cur3Pass!99',
      ...(initial_role ? { initial_role } : {}),
    },
    { type: 'cli', user_id: null },
  );

  return { person_id, user_id, tenant_id };
}

/**
 * Seed a directory_person row with NO linked user account.
 * Used by A1.6 and A1.7 tests that need a person whose account
 * will be provisioned or suspended as part of the test action.
 */
export async function seedDirectoryPersonOnly(
  pool: Pool,
  opts: {
    email?: string;
    tenant_id?: string;
  } = {},
): Promise<SeededDirectoryPerson> {
  const tenant_id = opts.tenant_id ?? crypto.randomUUID();
  if (!opts.tenant_id) {
    const tag = tenant_id.slice(0, 8);
    await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
      tenant_id,
      `Seed Tenant ${tag}`,
      `seed-${tag}`,
    ]);
  }

  const person_id = crypto.randomUUID();
  await identityDb()
    .insert(directoryPerson)
    .values({
      person_id,
      tenant_id,
      full_name: 'Test Person',
      work_email: opts.email ?? null,
      employment_status: 'active',
    });

  return { person_id, tenant_id };
}
