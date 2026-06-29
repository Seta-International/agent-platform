import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { deactivateUser, provisionLogin, reactivateUser } from '@seta/identity';
import { and, eq } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { person, worker } from '../db/schema.ts';
import { tenantScoped } from '../db/scope.ts';
import { PeopleError, requirePermission } from '../rbac.ts';

export interface SetPortalAccessInput {
  worker_id: string;
  enabled: boolean;
  session: SessionScope;
}

export async function setPortalAccess(
  input: SetPortalAccessInput,
): Promise<{ portal_access: boolean; changed: boolean }> {
  const { session, worker_id, enabled } = input;
  requirePermission(session, 'people.worker.portal_access.set');

  const [row] = await peopleDb()
    .select({
      person_id: worker.person_id,
      portal_access: worker.portal_access,
      work_email: worker.work_email,
      full_name: worker.full_name,
      user_id: person.user_id,
    })
    .from(worker)
    .innerJoin(person, eq(person.id, worker.person_id))
    .where(and(eq(worker.person_id, worker_id), tenantScoped(worker.tenant_id, session)))
    .limit(1);
  if (!row) throw new PeopleError('NOT_FOUND', 'worker not found');

  if (row.portal_access === enabled) return { portal_access: enabled, changed: false };

  const actor = { type: 'system' as const, user_id: session.user_id };
  let userId = row.user_id;

  // identity side commits first (no shared tx across modules).
  if (enabled) {
    if (!userId) {
      if (!row.work_email) {
        throw new PeopleError('VALIDATION', 'work_email is required to enable portal access');
      }
      const r = await provisionLogin(
        { tenant_id: session.tenant_id, email: row.work_email, name: row.full_name },
        actor,
      );
      userId = r.user_id;
    } else {
      await reactivateUser(userId, actor);
    }
  } else if (userId) {
    await deactivateUser(userId, actor);
  }

  // People side: flip the boolean + (re)bind, emit. The bind-user-to-person
  // subscriber also converges this idempotently from the user.created event.
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      await tx
        .update(worker)
        .set({ portal_access: enabled, updated_at: new Date() })
        .where(eq(worker.person_id, worker_id));
      if (enabled && userId && !row.user_id) {
        await tx
          .update(person)
          .set({ user_id: userId, updated_at: new Date() })
          .where(eq(person.id, worker_id));
      }
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'people.worker',
        aggregateId: worker_id,
        eventType: 'people.worker.portal_access.changed',
        eventVersion: 1,
        payload: { worker_id, tenant_id: session.tenant_id, enabled },
      });
    },
  );

  return { portal_access: enabled, changed: true };
}
