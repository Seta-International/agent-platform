import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
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
  const linkedIds = [
    ...new Set(
      input.people.map((p) => p.linked_person_id).filter((id): id is string => id != null),
    ),
  ];
  const byEmailSql = inArray(sql`lower(${person.work_email})`, emails);

  // One query for the whole batch — a first sync is the entire company, so a per-person lookup
  // would be thousands of round trips. Bound ids ride along in the same query: both matching keys
  // need the identical column set, and the union is still one round trip.
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
        linkedIds.length > 0 ? or(byEmailSql, inArray(person.id, linkedIds)) : byEmailSql,
      ),
    )) as MatchRow[];

  const byEmail = new Map<string, MatchRow[]>();
  const byId = new Map<string, MatchRow>();
  for (const row of matches) {
    byId.set(row.id, row);
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
  const seenLinkedInBatch = new Set<string>();
  // `byEmail` is a pre-transaction snapshot, so a person created earlier in THIS batch is not in
  // it. Without this, a duplicated email whose first occurrence was a create reports a collision
  // with an empty candidate list — nothing for the admin screen to act on.
  const createdInBatch = new Map<string, { person_id: string; full_name: string }>();

  const candidatesFor = (
    email: string,
    rows: MatchRow[],
  ): NonNullable<DirectorySyncOutcome['collision_candidates']> => {
    const created = createdInBatch.get(email);
    return [
      ...rows.map((c) => ({
        person_id: c.id,
        full_name: c.full_name ?? '',
        directory_managed: c.directory_managed,
      })),
      ...(created
        ? [{ person_id: created.person_id, full_name: created.full_name, directory_managed: true }]
        : []),
    ];
  };

  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      for (const incoming of input.people) {
        const email = normalizeEmail(incoming.work_email);
        const candidates = byEmail.get(email) ?? [];
        const collide = (): void => {
          results.push({
            entra_oid: incoming.entra_oid,
            person_id: null,
            outcome: 'collision',
            collision_candidates: candidatesFor(email, candidates),
          });
        };

        // Two incoming rows sharing a work_email is an ambiguous directory state, not something
        // to guess at. Reporting the duplicate as a collision also keeps the unique index from
        // aborting the whole batch on the second insert. Bound rows are held to this too — being
        // matched by id does not exempt the address they still write.
        if (seenInBatch.has(email)) {
          collide();
          continue;
        }
        seenInBatch.add(email);

        // A binding answers "which person is this?" outright, so email matching — and the
        // ambiguity detection that goes with it — does not apply. What still applies is every
        // state the database itself refuses to hold.
        const linkedId = incoming.linked_person_id ?? null;
        let current: MatchRow;
        let adopt = false;
        if (linkedId !== null) {
          // Two Entra users bound to one person is a collision, not a race to overwrite it.
          if (seenLinkedInBatch.has(linkedId)) {
            collide();
            continue;
          }
          seenLinkedInBatch.add(linkedId);

          const bound = byId.get(linkedId);
          // Deleted, or another tenant's: surface it rather than quietly creating a second person
          // and orphaning the binding — the whole defect this matching key exists to prevent.
          if (!bound) {
            collide();
            continue;
          }
          // Somebody else already holds the incoming address. `person_uniq_email_per_tenant` makes
          // taking it impossible, and letting it reach the UPDATE would abort the entire batch.
          if (candidates.some((c) => c.id !== bound.id)) {
            collide();
            continue;
          }
          current = bound;
          // Adoption (design §9.1 `link`): the admin's decision is what makes the person
          // sync-owned. An UPDATE, never a create, so `lifecycle_stage` and every other
          // human-curated column survive.
          adopt = !bound.directory_managed;
        } else {
          const managed = candidates.filter((c) => c.directory_managed);
          // A hand-created person, or an ambiguous multi-match, is left strictly alone — Task 12
          // raises an `email_collision` for a human to resolve.
          if (candidates.length > 1 || (candidates.length === 1 && managed.length === 0)) {
            collide();
            continue;
          }

          if (candidates.length === 0) {
            const created = await createFromDirectory(tx, session, incoming, email);
            if (created.person_id) {
              createdInBatch.set(email, {
                person_id: created.person_id,
                full_name: incoming.full_name,
              });
            }
            results.push(created);
            continue;
          }

          current = managed[0] as MatchRow;
        }

        const openPeriod = periodByPerson.get(current.id);
        const periodState: EmploymentPeriodState | null = openPeriod
          ? {
              job_title: openPeriod.job_title,
              employment_type: openPeriod.employment_type,
              start_date: openPeriod.start_date,
            }
          : null;

        const plan = planDirectoryUpdate(incoming, current, periodState);
        if (planIsEmpty(plan) && !adopt) {
          results.push({
            entra_oid: incoming.entra_oid,
            person_id: current.id,
            outcome: 'unchanged',
          });
          continue;
        }

        // `directory_managed` is asserted, not diffed — it is what adoption *means* — so it joins
        // the patch here rather than inside `planDirectoryUpdate`.
        const personPatch = adopt ? { ...plan.person, directory_managed: true } : plan.person;
        if (Object.keys(personPatch).length > 0) {
          await tx
            .update(person)
            .set({
              ...personPatch,
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
            fields: [...Object.keys(personPatch), ...Object.keys(plan.period)],
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
    // `!= null` matches directory-diff's asserted-when-present check, so create and update agree.
    personal_email:
      incoming.personal_email != null ? normalizeEmail(incoming.personal_email) : null,
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
  await tx
    .update(person)
    .set(extras)
    .where(and(eq(person.id, worker_id), eq(person.tenant_id, session.tenant_id)));

  // `insertWorkerAggregate` defaults every new period to 'preboarding', which is right for a
  // hand-created hire but wrong for a directory sync: someone already enabled in Entra is a
  // working employee, and read-workers filters on this column. Create path ONLY — the update
  // path never writes it, so human transitions (probation, on_leave, offboarding) survive.
  const periodPatch: Record<string, unknown> = {};
  if (incoming.account_enabled) periodPatch.lifecycle_stage = 'active';
  const endDate = normalizeDate(incoming.leave_date);
  if (endDate != null) periodPatch.end_date = endDate;

  if (Object.keys(periodPatch).length > 0) {
    await tx
      .update(employmentPeriod)
      .set(periodPatch)
      .where(
        and(
          eq(employmentPeriod.person_id, worker_id),
          eq(employmentPeriod.tenant_id, session.tenant_id),
          isNull(employmentPeriod.end_date),
        ),
      );
  }

  return { entra_oid: incoming.entra_oid, person_id: worker_id, outcome: 'created' };
}
