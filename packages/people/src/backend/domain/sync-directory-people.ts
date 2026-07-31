import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { employmentPeriod, person } from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';
import {
  type DirectoryPerson,
  type EmploymentPeriodState,
  normalizeDate,
  normalizeEmail,
  normalizeTime,
  type PersonState,
  planDirectoryUpdate,
  planIsEmpty,
} from './directory-diff.ts';
import { insertWorkerAggregate } from './insert-worker-aggregate.ts';

export type { DirectoryPerson } from './directory-diff.ts';

export interface DirectorySyncOutcome {
  entra_oid: string;
  person_id: string | null;
  outcome: 'created' | 'updated' | 'unchanged' | 'collision';
  collision_candidates?: Array<{
    person_id: string;
    full_name: string;
    directory_managed: boolean;
  }>;
}

interface MatchRow extends PersonState {
  id: string;
  directory_managed: boolean;
}

/**
 * The single write door the integrations module uses to push Entra directory data into `people`
 * (FUT-842 §8.1). Integrations never touches this schema; RBAC is re-checked here.
 *
 * This is deliberately NOT routed through `editWorker`: that guard refuses edits to
 * `full_name`/`work_email`/`employee_no`/`job_title` on a `directory_managed` person, and this
 * function is the owner those fields are locked *for*.
 */
export async function syncDirectoryPeople(input: {
  people: ReadonlyArray<DirectoryPerson>;
  session: SessionScope;
}): Promise<{ results: DirectorySyncOutcome[] }> {
  const { session } = input;
  // Creates and updates both happen below, so both slugs are required.
  requirePermission(session, 'people.worker.create');
  requirePermission(session, 'people.worker.update');

  if (input.people.length === 0) return { results: [] };

  const emails = [...new Set(input.people.map((p) => normalizeEmail(p.work_email)))];

  // One query for the whole batch — a first sync is the entire company, so a per-person lookup
  // would be thousands of round trips.
  const matches = (await peopleDb()
    .select({
      id: person.id,
      directory_managed: person.directory_managed,
      full_name: person.full_name,
      work_email: person.work_email,
      employee_no: person.employee_no,
      personal_email: person.personal_email,
      phone: person.phone,
      org_unit_id: person.org_unit_id,
      photo_storage_key: person.photo_storage_key,
      original_hire_date: person.original_hire_date,
      availability_status: person.availability_status,
      ooo_until: person.ooo_until,
      timezone: person.timezone,
      work_start: person.work_start,
      work_end: person.work_end,
    })
    .from(person)
    .where(
      and(
        eq(person.tenant_id, session.tenant_id),
        isNull(person.deleted_at),
        inArray(sql`lower(${person.work_email})`, emails),
      ),
    )) as MatchRow[];

  const byEmail = new Map<string, MatchRow[]>();
  for (const row of matches) {
    const key = normalizeEmail(row.work_email ?? '');
    const bucket = byEmail.get(key);
    if (bucket) bucket.push(row);
    else byEmail.set(key, [row]);
  }

  // Open employment periods for every matched person, again in one query.
  const matchedIds = matches.map((m) => m.id);
  const openPeriods = matchedIds.length
    ? await peopleDb()
        .select({
          id: employmentPeriod.id,
          person_id: employmentPeriod.person_id,
          job_title: employmentPeriod.job_title,
          employment_type: employmentPeriod.employment_type,
          start_date: employmentPeriod.start_date,
        })
        .from(employmentPeriod)
        .where(
          and(
            eq(employmentPeriod.tenant_id, session.tenant_id),
            inArray(employmentPeriod.person_id, matchedIds),
            isNull(employmentPeriod.end_date),
          ),
        )
    : [];
  const periodByPerson = new Map(openPeriods.map((p) => [p.person_id, p]));

  const results: DirectorySyncOutcome[] = [];
  const seenInBatch = new Set<string>();

  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      for (const incoming of input.people) {
        const email = normalizeEmail(incoming.work_email);
        const candidates = byEmail.get(email) ?? [];

        // Two incoming rows sharing a work_email is an ambiguous directory state, not something
        // to guess at. Reporting the duplicate as a collision also keeps the unique index from
        // aborting the whole batch on the second insert.
        if (seenInBatch.has(email)) {
          results.push({
            entra_oid: incoming.entra_oid,
            person_id: null,
            outcome: 'collision',
            collision_candidates: candidates.map((c) => ({
              person_id: c.id,
              full_name: c.full_name ?? '',
              directory_managed: c.directory_managed,
            })),
          });
          continue;
        }
        seenInBatch.add(email);

        const managed = candidates.filter((c) => c.directory_managed);
        // A hand-created person, or an ambiguous multi-match, is left strictly alone — Task 12
        // raises an `email_collision` for a human to resolve.
        if (candidates.length > 1 || (candidates.length === 1 && managed.length === 0)) {
          results.push({
            entra_oid: incoming.entra_oid,
            person_id: null,
            outcome: 'collision',
            collision_candidates: candidates.map((c) => ({
              person_id: c.id,
              full_name: c.full_name ?? '',
              directory_managed: c.directory_managed,
            })),
          });
          continue;
        }

        if (candidates.length === 0) {
          results.push(await createFromDirectory(tx, session, incoming, email));
          continue;
        }

        const current = managed[0] as MatchRow;
        const openPeriod = periodByPerson.get(current.id);
        const periodState: EmploymentPeriodState | null = openPeriod
          ? {
              job_title: openPeriod.job_title,
              employment_type: openPeriod.employment_type,
              start_date: openPeriod.start_date,
            }
          : null;

        const plan = planDirectoryUpdate(incoming, current, periodState);
        if (planIsEmpty(plan)) {
          results.push({
            entra_oid: incoming.entra_oid,
            person_id: current.id,
            outcome: 'unchanged',
          });
          continue;
        }

        if (Object.keys(plan.person).length > 0) {
          await tx
            .update(person)
            .set({
              ...plan.person,
              version: sql`${person.version} + 1`,
              updated_at: new Date(),
            })
            .where(and(eq(person.id, current.id), eq(person.tenant_id, session.tenant_id)));
        }
        if (Object.keys(plan.period).length > 0 && openPeriod) {
          await tx
            .update(employmentPeriod)
            .set({
              ...plan.period,
              version: sql`${employmentPeriod.version} + 1`,
              updated_at: new Date(),
            })
            .where(
              and(
                eq(employmentPeriod.id, openPeriod.id),
                eq(employmentPeriod.tenant_id, session.tenant_id),
              ),
            );
        }

        await emit({
          tenantId: session.tenant_id,
          aggregateType: 'people.worker',
          aggregateId: current.id,
          eventType: 'people.worker.updated',
          eventVersion: 1,
          payload: {
            worker_id: current.id,
            person_id: current.id,
            tenant_id: session.tenant_id,
            fields: [...Object.keys(plan.person), ...Object.keys(plan.period)],
            full_name: (plan.person.full_name as string | undefined) ?? current.full_name ?? '',
            work_email:
              'work_email' in plan.person
                ? (plan.person.work_email as string | null)
                : current.work_email,
            job_title:
              'job_title' in plan.period
                ? (plan.period.job_title as string | null)
                : (periodState?.job_title ?? null),
          },
        });

        results.push({
          entra_oid: incoming.entra_oid,
          person_id: current.id,
          outcome: 'updated',
        });
      }
    },
  );

  return { results };
}

/**
 * `insertWorkerAggregate` already writes person + employment_period seq 1 + person_history and
 * emits `people.worker.created`; only the directory-owned columns it has no argument for are
 * applied afterwards.
 */
async function createFromDirectory(
  tx: Parameters<Parameters<typeof withEmit>[1]>[0],
  session: SessionScope,
  incoming: DirectoryPerson,
  email: string,
): Promise<DirectorySyncOutcome> {
  const startDate = normalizeDate(incoming.hire_date);
  const { worker_id } = await insertWorkerAggregate(tx, {
    tenant_id: session.tenant_id,
    by_user_id: session.user_id,
    full_name: incoming.full_name,
    employee_no: incoming.employee_no,
    work_email: email,
    personal_email: incoming.personal_email ? normalizeEmail(incoming.personal_email) : null,
    start_date: startDate,
    employment_type: incoming.employment_type,
    phone: incoming.phone,
    job_title: incoming.job_title,
    org_unit_id: incoming.org_unit_id,
    history_action: 'created',
  });

  const extras: Record<string, unknown> = { directory_managed: true };
  if (incoming.photo_storage_key != null) extras.photo_storage_key = incoming.photo_storage_key;
  // `auto_replies_enabled === null` means Graph refused mailboxSettings — write nothing sourced
  // from it rather than persisting nulls that read as "this person has no working hours".
  if (incoming.auto_replies_enabled !== null) {
    if (incoming.timezone != null) extras.timezone = incoming.timezone;
    extras.work_start = normalizeTime(incoming.work_start);
    extras.work_end = normalizeTime(incoming.work_end);
    if (incoming.auto_replies_enabled) {
      extras.availability_status = 'ooo';
      extras.ooo_until = incoming.ooo_until == null ? null : new Date(incoming.ooo_until);
    }
  }
  await tx.update(person).set(extras).where(eq(person.id, worker_id));

  const endDate = normalizeDate(incoming.leave_date);
  if (endDate != null) {
    await tx
      .update(employmentPeriod)
      .set({ end_date: endDate })
      .where(and(eq(employmentPeriod.person_id, worker_id), isNull(employmentPeriod.end_date)));
  }

  return { entra_oid: incoming.entra_oid, person_id: worker_id, outcome: 'created' };
}
