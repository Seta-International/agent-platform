import type { SessionScope } from '@seta/core';
import {
  buildRegistry,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
  resolvePermissions,
} from '@seta/shared-rbac';
import type { Pool } from 'pg';
import { identityDb } from '../../src/backend/db/index.ts';
import { personProjection, roleAssignments } from '../../src/backend/db/schema.ts';
import { createUser } from '../../src/backend/domain/create-user.ts';
import { deactivateUser } from '../../src/backend/domain/deactivate-user.ts';

const _rbacRegistry = buildRegistry(inventoryToManifests(INVENTORY));

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
 * Seed a person_projection row paired with a matching user account.
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
    name?: string;
    roles?: string[];
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

  const displayName = opts.name ?? 'Test Person';
  const person_id = crypto.randomUUID();
  await identityDb().insert(personProjection).values({
    person_id,
    tenant_id,
    full_name: displayName,
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
      name: displayName,
      password: 'S3cur3Pass!99',
      ...(initial_role ? { initial_role } : {}),
    },
    { type: 'cli', user_id: null },
  );

  if (opts.roles && opts.roles.length > 0) {
    for (const role_slug of opts.roles) {
      await identityDb().insert(roleAssignments).values({
        id: crypto.randomUUID(),
        user_id,
        tenant_id,
        role_slug,
        scope_kind: 'tenant',
        scope_id: null,
        granted_by: null,
        granted_via: 'cli',
      });
    }
  }

  if (opts.suspended) {
    // Deactivating an admin in a single-admin tenant would hit LAST_ORG_ADMIN;
    // seed a second admin first so the guard passes and the target suspends.
    if (opts.admin) {
      const tag = crypto.randomUUID().slice(0, 8);
      await createUser(
        {
          tenant_id,
          email: `co-admin-${tag}@seed.local`,
          name: 'Co Admin',
          password: 'S3cur3Pass!99',
          initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
        },
        { type: 'cli', user_id: null },
      );
    }
    await deactivateUser(user_id, { type: 'system', user_id: null });
  }

  return { person_id, user_id, tenant_id };
}

/**
 * Seed a person_projection row with NO linked user account.
 * Used by A1.6 and A1.7 tests that need a person whose account
 * will be provisioned or suspended as part of the test action.
 */
export async function seedDirectoryPersonOnly(
  pool: Pool,
  opts: {
    email?: string;
    tenant_id?: string;
    name?: string;
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
    .insert(personProjection)
    .values({
      person_id,
      tenant_id,
      full_name: opts.name ?? 'Test Person',
      work_email: opts.email ?? null,
      employment_status: 'active',
    });

  return { person_id, tenant_id };
}

/**
 * Create a synthetic SessionScope for unit/integration tests.
 * Computes the permissions set from the RBAC registry given a role list,
 * OR accepts a raw permission list via `perms` to bypass role lookup.
 */
export function testSession(opts: {
  tenant?: string;
  user_id?: string;
  perms?: string[];
  roles?: string[];
}): SessionScope {
  const tenant_id = opts.tenant ?? crypto.randomUUID();
  const user_id = opts.user_id ?? crypto.randomUUID();
  const roles = opts.roles ?? [];

  let permissions: ReadonlySet<string>;
  if (opts.perms !== undefined) {
    permissions = new Set(opts.perms);
  } else {
    permissions = resolvePermissions(_rbacRegistry, roles, IMPLICIT_PERMISSIONS);
  }

  return {
    session_id: crypto.randomUUID(),
    user_id,
    tenant_id,
    email: 'test@seed.local',
    display_name: 'Test User',
    role_summary: { roles, cross_tenant_read: false, assignments: [] },
    role_summary_hash: 'test',
    permissions,
    assignments: [],
    group_ids: [],
    product_access: new Set<string>(),
    worker_id: null,
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };
}
