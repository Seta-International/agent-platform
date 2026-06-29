import { createHash } from 'node:crypto';
import type { SessionScope } from '@seta/core';
import { coreDb } from '@seta/core/db';
import type { Actor } from '@seta/identity';
import { createUser, grantRole, updateUserProfile } from '@seta/identity';
import { addPersonSkill, createWorker, genderValue } from '@seta/people';
import { sql } from 'drizzle-orm';
import type { EmployeeRec } from './load.ts';
import type { SeededSkill } from './phase-skills.ts';
import { rolesFor } from './rbac-map.ts';
import { skillNamesForRole, techStackFor } from './skill-catalog.ts';

// createWorker returns person_id as the canonical worker identity (so do
// editWorker/setPortalAccess); resolve the same id here so create vs. find agree.
async function findWorkerId(tenantId: string, email: string): Promise<string | undefined> {
  const r = await coreDb().execute(
    sql`SELECT person_id FROM people.worker
        WHERE tenant_id = ${tenantId} AND lower(work_email) = lower(${email})
          AND deleted_at IS NULL
        LIMIT 1`,
  );
  return (r.rows[0] as { person_id: string } | undefined)?.person_id;
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
  skills: Map<string, SeededSkill>,
): Promise<Map<string, { workerId: string; userId: string }>> {
  const actor: Actor = { type: 'cli', user_id: session.user_id };
  const map = new Map<string, { workerId: string; userId: string }>();

  for (const e of employees) {
    if (!e.full_name?.trim() || !e.work_email?.trim()) continue;

    const gender = genderValue.safeParse(e.gender);
    const hireDate = e.hire_date?.trim() || null;

    // worker — idempotent on work_email
    let workerId = await findWorkerId(session.tenant_id, e.work_email);
    if (!workerId) {
      const created = await createWorker({
        full_name: e.full_name,
        employee_no: e.id,
        work_email: e.work_email,
        employment_type: e.employment_type || undefined,
        phone: e.phone || undefined,
        gender: gender.success ? gender.data : undefined,
        start_date: hireDate ?? undefined,
        session,
      });
      workerId = created.worker_id;
    } else {
      // The fixture is the authoritative source of these HR fields; backfill them onto workers
      // the base seed created from a CSV that lacked the id/phone/gender columns.
      const genderVal = gender.success ? gender.data : null;
      await coreDb().execute(
        sql`UPDATE people.worker
              SET employee_no = ${e.id},
                  phone = coalesce(${e.phone || null}, phone),
                  gender = coalesce(${genderVal}, gender)
            WHERE person_id = ${workerId}
              AND (employee_no IS DISTINCT FROM ${e.id}
                   OR phone IS DISTINCT FROM ${e.phone || null}
                   OR gender IS DISTINCT FROM ${genderVal})`,
      );
    }

    // Onboarding: createWorker fixes lifecycle at 'preboarding' with no start_date. These are
    // current, allocated staff, so set the fixture hire date and mark the open period active.
    if (hireDate) {
      await coreDb().execute(
        sql`UPDATE people.employment_period
              SET start_date = ${hireDate}, lifecycle_stage = 'active', status = 'active'
            WHERE person_id = ${workerId} AND end_date IS NULL
              AND (start_date IS DISTINCT FROM ${hireDate}::date OR lifecycle_stage <> 'active')`,
      );
      await coreDb().execute(
        sql`UPDATE people.person
              SET original_hire_date = coalesce(original_hire_date, ${hireDate}::date),
                  seniority_date = coalesce(seniority_date, ${hireDate}::date)
            WHERE id = ${workerId}`,
      );
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
        skills: skillNamesForRole(e.primary_role),
        role: e.primary_role,
      },
      actor,
    );

    // Tech stack — populate people.person_skill (what the directory Techstack column reads).
    // Role base skills plus a deterministic handful of extras so same-role peers differ.
    const seed = createHash('sha1')
      .update(e.id || e.work_email)
      .digest();
    for (const skillName of techStackFor(e.primary_role, seed.readUInt32BE(0))) {
      const skill = skills.get(skillName.toLowerCase());
      if (skill) await addPersonSkill({ person_id: workerId, skill_id: skill.id, session });
    }

    map.set(e.id, { workerId, userId });
  }

  return map;
}
