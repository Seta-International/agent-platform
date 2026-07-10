import type { SessionScope } from '@seta/core';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { userProjection, worker } from '../db/schema.ts';
import { PeopleError, requirePermission } from '../rbac.ts';

export interface SetPresenceInput {
  availability_status?: 'available' | 'busy' | 'ooo';
  ooo_until?: Date | null;
  working_hours?: { start: string; end: string } | null;
  timezone?: string;
}

export async function setPresence(session: SessionScope, input: SetPresenceInput): Promise<void> {
  requirePermission(session, 'people.self.manage');

  const [row] = await peopleDb()
    .select({ person_id: worker.person_id })
    .from(worker)
    .innerJoin(userProjection, eq(userProjection.person_id, worker.person_id))
    .where(
      and(tenantScoped(worker.tenant_id, session), eq(userProjection.user_id, session.user_id)),
    )
    .limit(1);

  if (!row) throw new PeopleError('NOT_FOUND', 'no worker record linked to this user');

  const set: Record<string, unknown> = { updated_at: new Date() };
  if (input.availability_status !== undefined) set.availability_status = input.availability_status;
  if (input.ooo_until !== undefined) set.ooo_until = input.ooo_until;
  if (input.working_hours !== undefined) {
    set.work_start = input.working_hours?.start ?? null;
    set.work_end = input.working_hours?.end ?? null;
  }
  if (input.timezone !== undefined) set.timezone = input.timezone;

  if (Object.keys(set).length === 1) return;

  await peopleDb().update(worker).set(set).where(eq(worker.person_id, row.person_id));
}
