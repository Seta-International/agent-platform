import type { SessionScope } from '@seta/core';
import { and, eq } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { person, worker } from '../db/schema.ts';
import { tenantScoped } from '../db/scope.ts';
import { PeopleError, requirePermission } from '../rbac.ts';

export interface SetPresenceInput {
  availability_status?: 'available' | 'busy' | 'ooo';
  ooo_until?: Date | null;
  working_hours?: { start: string; end: string } | null;
  timezone?: string;
}

export async function setPresence(session: SessionScope, input: SetPresenceInput): Promise<void> {
  requirePermission(session, 'people.worker.read');

  const [row] = await peopleDb()
    .select({ person_id: worker.person_id })
    .from(worker)
    .innerJoin(person, eq(person.id, worker.person_id))
    .where(and(tenantScoped(worker.tenant_id, session), eq(person.user_id, session.user_id)))
    .limit(1);

  if (!row) throw new PeopleError('NOT_FOUND', 'no worker record linked to this user');

  const set: Record<string, unknown> = { updated_at: new Date() };
  if (input.availability_status !== undefined) set.availability_status = input.availability_status;
  if (input.ooo_until !== undefined) set.ooo_until = input.ooo_until;
  if (input.working_hours !== undefined) set.working_hours = input.working_hours;
  if (input.timezone !== undefined) set.timezone = input.timezone;

  if (Object.keys(set).length === 1) return;

  await peopleDb().update(worker).set(set).where(eq(worker.person_id, row.person_id));
}
