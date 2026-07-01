import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { syncLoginIdentity } from '@seta/identity';
import { can } from '@seta/shared-rbac';
import { and, eq } from 'drizzle-orm';
import type { EditWorkerInput } from '../../contracts.ts';
import { peopleDb } from '../db/client.ts';
import { person, worker, workerHistory } from '../db/schema.ts';
import { tenantScoped } from '../db/scope.ts';
import { PeopleError, requirePermission } from '../rbac.ts';
import { classifyField } from './field-rules.ts';

export async function editWorker(
  input: EditWorkerInput & { session: SessionScope },
): Promise<{ version: number }> {
  const { session, worker_id, patch } = input;
  requirePermission(session, 'people.worker.read');

  const [current] = await peopleDb()
    .select()
    .from(worker)
    .innerJoin(person, eq(person.id, worker.person_id))
    .where(and(eq(worker.person_id, worker_id), tenantScoped(worker.tenant_id, session)))
    .limit(1);
  if (!current) throw new PeopleError('NOT_FOUND', 'worker not found');

  const isOwner = current.person.user_id === session.user_id;
  const isAdmin = can(session, 'people.worker.edit');

  const entries = Object.entries(patch).filter(([, v]) => v !== undefined) as [string, unknown][];
  for (const [field] of entries) {
    const klass = classifyField(field);
    if (klass === 'admin_only' && !isAdmin) {
      throw new PeopleError('FORBIDDEN', `Field ${field} is admin-only`);
    }
    if (klass === 'personal' && !isOwner && !isAdmin) {
      throw new PeopleError('FORBIDDEN', `Cannot edit ${field}`);
    }
  }

  const changes = entries.filter(
    ([f, v]) =>
      JSON.stringify((current.worker as Record<string, unknown>)[f]) !== JSON.stringify(v),
  );
  if (changes.length === 0) return { version: current.worker.version };

  const nextVersion = current.worker.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const set: Record<string, unknown> = { version: nextVersion, updated_at: new Date() };
      for (const [f, v] of changes) set[f] = v;
      if (isOwner && current.worker.profile_completed_at == null)
        set.profile_completed_at = new Date();
      const updated = await tx
        .update(worker)
        .set(set)
        // guard: 0 rows ⇒ the row changed since our read (lost-update prevention)
        .where(
          and(
            eq(worker.person_id, worker_id),
            eq(worker.version, input.expected_version ?? current.worker.version),
          ),
        )
        .returning({ id: worker.person_id });
      if (updated.length === 0) {
        throw new PeopleError('CONFLICT', 'version mismatch', {
          current_version: current.worker.version,
        });
      }

      for (const [f, v] of changes) {
        await tx.insert(workerHistory).values({
          tenant_id: session.tenant_id,
          person_id: worker_id,
          action: 'updated',
          field: f,
          from_val: (current.worker as Record<string, unknown>)[f] ?? null,
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
            (changesMap.get('full_name') as string | undefined) ?? current.worker.full_name,
          work_email: changesMap.has('work_email')
            ? (changesMap.get('work_email') as string | null)
            : current.worker.work_email,
          job_title: changesMap.has('job_title')
            ? (changesMap.get('job_title') as string | null)
            : current.worker.job_title,
        },
      });
    },
  );

  const linkedUserId = current.person.user_id;
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
