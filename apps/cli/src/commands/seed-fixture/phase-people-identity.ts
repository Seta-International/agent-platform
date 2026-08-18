import { createHash } from 'node:crypto';
import type { SessionScope } from '@seta/core';
import { coreDb } from '@seta/core/db';
import type { Actor } from '@seta/identity';
import { addGroupMembers, ensureLocalLogin, provisionLogin } from '@seta/identity';
import { addPersonSkill, createWorker, genderValue } from '@seta/people';
import { sql } from 'drizzle-orm';
import type { EmployeeRec } from './load.ts';
import type { SeededSkill } from './phase-skills.ts';
import { techStackFor } from './skill-catalog.ts';

// createWorker returns person_id as the canonical worker identity (so does
// editWorker); resolve the same id here so create vs. find agree.
async function findWorkerId(tenantId: string, email: string): Promise<string | undefined> {
  const r = await coreDb().execute(
    sql`SELECT id FROM people.person
        WHERE tenant_id = ${tenantId} AND lower(work_email) = lower(${email})
          AND deleted_at IS NULL
        LIMIT 1`,
  );
  return (r.rows[0] as { id: string } | undefined)?.id;
}

export async function seedPeopleIdentity(
  session: SessionScope,
  employees: EmployeeRec[],
  password: string,
  skills: Map<string, SeededSkill>,
  groups: Map<string, string>,
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
        job_title: e.primary_role || undefined,
        session,
      });
      workerId = created.worker_id;
    } else {
      // The fixture is the authoritative source of these HR fields; backfill them onto workers
      // the base seed created from a CSV that lacked the id/phone/gender columns.
      const genderVal = gender.success ? gender.data : null;
      await coreDb().execute(
        sql`UPDATE people.person
              SET employee_no = ${e.id},
                  phone = coalesce(${e.phone || null}, phone),
                  gender = coalesce(${genderVal}, gender)
            WHERE id = ${workerId}
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
              SET start_date = ${hireDate}, lifecycle_stage = 'active',
                  job_title = coalesce(job_title, ${e.primary_role || null})
            WHERE person_id = ${workerId} AND end_date IS NULL
              AND (start_date IS DISTINCT FROM ${hireDate}::date OR lifecycle_stage <> 'active' OR job_title IS DISTINCT FROM ${e.primary_role || null})`,
      );
      await coreDb().execute(
        sql`UPDATE people.person
              SET original_hire_date = coalesce(original_hire_date, ${hireDate}::date),
                  seniority_date = coalesce(seniority_date, ${hireDate}::date)
            WHERE id = ${workerId}`,
      );
    }

    // identity login — provision via the same concurrency-safe path the auto-provision
    // subscriber uses (idempotent on email, so it composes with the subscriber instead of
    // racing it), then attach the shared demo credential so employees can still password-log-in.
    const { user_id: userId } = await provisionLogin(
      { tenant_id: session.tenant_id, email: e.work_email, name: e.full_name },
      actor,
    );
    await ensureLocalLogin({ user_id: userId, tenant_id: session.tenant_id, password }, actor);

    for (const slug of ['member', ...e.access_groups]) {
      const gid = groups.get(slug);
      if (gid)
        await addGroupMembers(
          { group_id: gid, tenant_id: session.tenant_id, user_ids: [userId] },
          actor,
        );
    }

    // Presence lives on people.person now. availability defaults to 'available' at
    // createWorker; set the fixture timezone (all staff are VN-based). Keyed by the
    // person, not a session, so this is not the self-service setPresence path.
    await coreDb().execute(
      sql`UPDATE people.person
            SET timezone = 'Asia/Ho_Chi_Minh', updated_at = now()
          WHERE id = ${workerId} AND timezone IS DISTINCT FROM 'Asia/Ho_Chi_Minh'`,
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

  // Backfill pm.person_projection for all seeded workers so PM allocation views
  // (e.g. RA Monitoring seniority column) have up-to-date worker names & job titles.
  await coreDb().execute(
    sql`INSERT INTO pm.person_projection (person_id, tenant_id, full_name, job_title, updated_at)
        SELECT p.id, p.tenant_id, p.full_name, ep.job_title, now()
        FROM people.person p
        LEFT JOIN people.employment_period ep ON ep.person_id = p.id AND ep.end_date IS NULL
        WHERE p.tenant_id = ${session.tenant_id} AND p.deleted_at IS NULL
        ON CONFLICT (person_id) DO UPDATE
        SET full_name = EXCLUDED.full_name,
            job_title = EXCLUDED.job_title,
            updated_at = now()`,
  );

  return map;
}
