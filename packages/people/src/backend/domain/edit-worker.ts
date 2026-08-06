import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { syncLoginIdentity } from '@seta/identity';
import { can, tenantScoped } from '@seta/shared-rbac';
import { and, eq, isNull } from 'drizzle-orm';
import type { EditWorkerInput } from '../../contracts.ts';
import { peopleDb } from '../db/client.ts';
import { employmentPeriod, person, personHistory, userProjection } from '../db/schema.ts';
import { PeopleError, requirePermission } from '../rbac.ts';
import { classifyField, isM365Owned } from './field-rules.ts';

export async function editWorker(
  input: EditWorkerInput & { session: SessionScope },
): Promise<{ version: number }> {
  const { session, worker_id, patch } = input;
  requirePermission(session, 'people.worker.read');

  const [current] = await peopleDb()
    .select({
      person,
      job_title: employmentPeriod.job_title,
      linked_user_id: userProjection.user_id,
    })
    .from(person)
    .leftJoin(
      employmentPeriod,
      and(eq(employmentPeriod.person_id, person.id), isNull(employmentPeriod.end_date)),
    )
    .leftJoin(userProjection, eq(userProjection.person_id, person.id))
    .where(and(eq(person.id, worker_id), tenantScoped(person.tenant_id, session)))
    .limit(1);
  if (!current) throw new PeopleError('NOT_FOUND', 'worker not found');

  const currentView = { ...current.person, job_title: current.job_title } as Record<
    string,
    unknown
  >;

  const isOwner = current.linked_user_id === session.user_id;
  const isAdmin = can(session, 'people.worker.update');

  const entries = Object.entries(patch).filter(([, v]) => v !== undefined) as [string, unknown][];
  for (const [field] of entries) {
    if (current.person.directory_managed && isM365Owned(field)) {
      throw new PeopleError('FORBIDDEN', `${field} is managed by Microsoft 365`, {
        code: 'PERSON_FIELD_M365_MANAGED',
        field,
      });
    }
    const klass = classifyField(field);
    if (klass === 'admin_only' && !isAdmin) {
      throw new PeopleError('FORBIDDEN', `Field ${field} is admin-only`);
    }
    if (klass === 'personal' && !isOwner && !isAdmin) {
      throw new PeopleError('FORBIDDEN', `Cannot edit ${field}`);
    }
  }

  const changes = entries.filter(([f, v]) => JSON.stringify(currentView[f]) !== JSON.stringify(v));
  if (changes.length === 0) return { version: current.person.version };

  const nextVersion = current.person.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const set: Record<string, unknown> = { version: nextVersion, updated_at: new Date() };
      for (const [f, v] of changes) {
        if (f === 'job_title') continue;
        set[f] = v;
      }
      if (isOwner && current.person.profile_completed_at == null)
        set.profile_completed_at = new Date();
      // guard: 0 rows ⇒ the row changed since our read (lost-update prevention)
      const updated = await tx
        .update(person)
        .set(set)
        .where(
          and(
            eq(person.id, worker_id),
            eq(person.version, input.expected_version ?? current.person.version),
          ),
        )
        .returning({ id: person.id });
      if (updated.length === 0) {
        throw new PeopleError('CONFLICT', 'version mismatch', {
          current_version: current.person.version,
        });
      }

      const jobTitleChange = changes.find(([f]) => f === 'job_title');
      if (jobTitleChange) {
        const jobTitleUpdated = await tx
          .update(employmentPeriod)
          .set({ job_title: jobTitleChange[1] as string | null, updated_at: new Date() })
          .where(
            and(
              eq(employmentPeriod.person_id, worker_id),
              isNull(employmentPeriod.end_date),
              tenantScoped(employmentPeriod.tenant_id, session),
            ),
          )
          .returning({ id: employmentPeriod.id });
        if (jobTitleUpdated.length === 0) {
          throw new PeopleError(
            'CONFLICT',
            'cannot set job_title: worker has no active employment period',
          );
        }
      }

      for (const [f, v] of changes) {
        await tx.insert(personHistory).values({
          tenant_id: session.tenant_id,
          person_id: worker_id,
          action: 'updated',
          field: f,
          from_val: currentView[f] ?? null,
          to_val: v ?? null,
          by_user_id: session.user_id,
        });
      }

      const changesMap = new Map(changes);
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'people.worker',
        aggregateId: worker_id,
        eventType: 'people.worker.updated',
        eventVersion: 1,
        payload: {
          worker_id,
          person_id: worker_id,
          tenant_id: session.tenant_id,
          fields: changes.map(([f]) => f),
          full_name:
            (changesMap.get('full_name') as string | undefined) ?? current.person.full_name,
          work_email: changesMap.has('work_email')
            ? (changesMap.get('work_email') as string | null)
            : current.person.work_email,
          job_title: changesMap.has('job_title')
            ? (changesMap.get('job_title') as string | null)
            : current.job_title,
        },
      });
    },
  );

  const linkedUserId = current.linked_user_id;
  if (linkedUserId && (patch.full_name !== undefined || patch.work_email !== undefined)) {
    await syncLoginIdentity(
      {
        user_id: linkedUserId,
        name: patch.full_name,
        email: patch.work_email,
      },
      { type: 'system', user_id: session.user_id },
    );
  }

  return { version: nextVersion };
}
