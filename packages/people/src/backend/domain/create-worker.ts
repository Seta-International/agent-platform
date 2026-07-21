import { getTenantEmailDomains, type SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import type { CreateWorkerInput } from '../../contracts.ts';
import { peopleDb } from '../db/client.ts';
import { person } from '../db/schema.ts';
import { PeopleError, requirePermission } from '../rbac.ts';
import { insertWorkerAggregate } from './insert-worker-aggregate.ts';
import { generateWorkEmail } from './work-email.ts';

/** Unique indexes on people.person whose violation is a user-fixable conflict, not a 500. */
const UNIQUE_CONFLICT_MESSAGES: Record<string, string> = {
  person_uniq_email_per_tenant: 'work_email already in use',
  person_uniq_employee_no_per_tenant: 'employee_no already in use',
};

function uniqueConflictMessage(err: unknown): string | undefined {
  // Drizzle wraps the driver error (DrizzleQueryError.cause) — walk the cause
  // chain so both wrapped and raw pg errors match.
  for (let e = err; e instanceof Error; e = e.cause) {
    const pg = e as Error & { code?: string; constraint?: string };
    if (pg.code === '23505' && pg.constraint) return UNIQUE_CONFLICT_MESSAGES[pg.constraint];
  }
  return undefined;
}

export async function createWorker(
  input: CreateWorkerInput & { session: SessionScope },
): Promise<{ worker_id: string }> {
  const { session } = input;
  requirePermission(session, 'people.worker.create');
  if (!input.full_name.trim()) throw new PeopleError('VALIDATION', 'full_name is required');

  const domains = await getTenantEmailDomains(session.tenant_id);
  const isTaken = async (email: string): Promise<boolean> => {
    const [row] = await peopleDb()
      .select({ id: person.id })
      .from(person)
      .where(
        and(
          eq(person.tenant_id, session.tenant_id),
          eq(person.work_email, email),
          isNull(person.deleted_at),
        ),
      )
      .limit(1);
    return Boolean(row);
  };

  let workEmail: string | null = null;
  if (input.work_email) {
    const supplied = input.work_email.toLowerCase().trim();
    const domain = supplied.split('@')[1] ?? '';
    if (domains.length > 0 && !domains.includes(domain)) {
      throw new PeopleError(
        'VALIDATION',
        `work_email domain must be one of: ${domains.join(', ')}`,
      );
    }
    if (await isTaken(supplied)) throw new PeopleError('CONFLICT', 'work_email already in use');
    workEmail = supplied;
  } else if (domains.length > 0 && domains[0]) {
    workEmail = await generateWorkEmail(input.full_name, domains[0], isTaken);
  }

  let result!: { worker_id: string };
  try {
    await withEmit(
      { actor: { userId: session.user_id, tenantId: session.tenant_id } },
      async (tx) => {
        result = await insertWorkerAggregate(tx, {
          tenant_id: session.tenant_id,
          by_user_id: session.user_id,
          full_name: input.full_name.trim(),
          employee_no: input.employee_no?.trim() || null,
          work_email: workEmail,
          personal_email: input.personal_email?.toLowerCase().trim() || null,
          start_date: input.start_date ?? null,
          employment_type: input.employment_type ?? null,
          dob: input.dob ?? null,
          gender: input.gender ?? null,
          phone: input.phone ?? null,
          emergency_contact: input.emergency_contact ?? null,
          job_title: input.job_title ?? null,
          org_unit_id: input.org_unit_id ?? null,
          history_action: 'created',
        });
      },
    );
  } catch (err) {
    const conflict = uniqueConflictMessage(err);
    if (conflict) throw new PeopleError('CONFLICT', conflict);
    throw err;
  }
  return result;
}
