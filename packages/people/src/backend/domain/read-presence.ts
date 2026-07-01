import type { SessionScope } from '@seta/core';
import { and, eq } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { person, worker } from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';

export interface PresenceResult {
  availability_status: 'available' | 'busy' | 'ooo';
  ooo_until: Date | null;
  working_hours: { start: string; end: string } | null;
  timezone: string;
}

const PRESENCE_DEFAULTS: PresenceResult = {
  availability_status: 'available',
  ooo_until: null,
  working_hours: null,
  timezone: 'UTC',
};

// Shared by readPresence (domain/HTTP callers) and the agent-tool spec execute.
// No session gate — callers are responsible for RBAC before calling this.
export async function fetchPresenceByUserId(
  tenantId: string,
  userId: string,
): Promise<PresenceResult> {
  const [row] = await peopleDb()
    .select({
      availability_status: worker.availability_status,
      ooo_until: worker.ooo_until,
      working_hours: worker.working_hours,
      timezone: worker.timezone,
    })
    .from(worker)
    .innerJoin(person, eq(person.id, worker.person_id))
    .where(and(eq(worker.tenant_id, tenantId), eq(person.user_id, userId)))
    .limit(1);

  if (!row) return PRESENCE_DEFAULTS;
  return {
    availability_status: row.availability_status as 'available' | 'busy' | 'ooo',
    ooo_until: row.ooo_until,
    working_hours: row.working_hours,
    timezone: row.timezone,
  };
}

export async function readPresence(
  session: SessionScope,
  input: { user_id: string },
): Promise<PresenceResult> {
  requirePermission(session, 'people.worker.read');
  return fetchPresenceByUserId(session.tenant_id, input.user_id);
}
