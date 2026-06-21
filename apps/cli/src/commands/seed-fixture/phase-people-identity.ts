import type { SessionScope } from '@seta/core';
import { coreDb } from '@seta/core/db';
import type { Actor } from '@seta/identity';
import { createUser, grantRole, updateUserProfile } from '@seta/identity';
import { createWorker } from '@seta/people';
import { sql } from 'drizzle-orm';
import type { EmployeeRec } from './load.ts';
import { rolesFor, skillsFor } from './rbac-map.ts';

async function findWorkerId(tenantId: string, email: string): Promise<string | undefined> {
  const r = await coreDb().execute(
    sql`SELECT id FROM people.worker
        WHERE tenant_id = ${tenantId} AND lower(work_email) = lower(${email})
          AND deleted_at IS NULL
        LIMIT 1`,
  );
  return (r.rows[0] as { id: string } | undefined)?.id;
}

async function findUserId(tenantId: string, email: string): Promise<string | undefined> {
  const r = await coreDb().execute(
    sql`SELECT id FROM identity."user"
        WHERE tenant_id = ${tenantId} AND lower(email) = lower(${email})
        LIMIT 1`,
  );
  return (r.rows[0] as { id: string } | undefined)?.id;
}

async function hasGrant(
  userId: string,
  tenantId: string,
  roleSlug: string,
  scopeType: 'tenant' | 'group',
  scopeId: string | null,
): Promise<boolean> {
  const r = await coreDb().execute(
    sql`SELECT 1 FROM identity.role_grants
        WHERE user_id = ${userId} AND tenant_id = ${tenantId}
          AND role_slug = ${roleSlug} AND scope_type = ${scopeType}
          AND scope_id IS NOT DISTINCT FROM ${scopeId}
          AND revoked_at IS NULL
        LIMIT 1`,
  );
  return r.rows.length > 0;
}

export async function seedPeopleIdentity(
  session: SessionScope,
  employees: EmployeeRec[],
  password: string,
): Promise<Map<string, { workerId: string; userId: string }>> {
  const actor: Actor = { type: 'cli', user_id: session.user_id };
  const map = new Map<string, { workerId: string; userId: string }>();

  for (const e of employees) {
    if (!e.full_name?.trim() || !e.work_email?.trim()) continue;

    // worker — idempotent on work_email
    let workerId = await findWorkerId(session.tenant_id, e.work_email);
    if (!workerId) {
      const created = await createWorker({
        full_name: e.full_name,
        work_email: e.work_email,
        employment_type: e.employment_type || undefined,
        session,
      });
      workerId = created.worker_id;
    }

    // identity login — idempotent on email
    let userId = await findUserId(session.tenant_id, e.work_email);
    if (!userId) {
      const created = await createUser(
        { tenant_id: session.tenant_id, email: e.work_email, name: e.full_name, password },
        actor,
      );
      userId = created.user_id;
    }

    // role grants — check before each insert (append-only table, no unique constraint)
    for (const g of rolesFor(e.primary_role)) {
      const already = await hasGrant(userId, session.tenant_id, g.slug, g.scope_type, g.scope_id);
      if (!already) {
        await grantRole(
          {
            user_id: userId,
            tenant_id: session.tenant_id,
            role_slug: g.slug,
            scope_type: g.scope_type,
            scope_id: g.scope_id,
          },
          actor,
        );
      }
    }

    // profile — set-state, call unconditionally
    await updateUserProfile(
      userId,
      {
        availability_status: 'available',
        timezone: 'Asia/Ho_Chi_Minh',
        skills: skillsFor(e.primary_role),
        role: e.primary_role,
      },
      actor,
    );

    map.set(e.id, { workerId, userId });
  }

  return map;
}
