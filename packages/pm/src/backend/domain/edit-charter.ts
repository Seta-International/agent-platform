import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq } from 'drizzle-orm';
import type { EditCharterInput } from '../../contracts.ts';
import { PM_CHARTER_UPDATED } from '../../events.ts';
import { pmDb } from '../db/client.ts';
import { project } from '../db/schema.ts';
import { PmError, requirePermission } from '../rbac.ts';

// Patch fields whose names differ from their `project` column (mirrors the
// edit-account.ts field→column map precedent from PR3). All other patch fields
// (name, objective, scope, budget_bmm, team_size, methodology, pricing_model,
// date_from, date_to) map 1:1.
const FIELD_TO_COLUMN: Record<string, string> = {
  pm_worker_id: 'pm_person_id',
  pmo_worker_id: 'pmo_person_id',
};

export async function editCharter(
  input: EditCharterInput & { session: SessionScope },
): Promise<{ version: number }> {
  const { session, charter_id, patch } = input;
  requirePermission(session, 'pm.charter.submit');

  const [current] = await pmDb()
    .select()
    .from(project)
    .where(and(eq(project.id, charter_id), tenantScoped(project.tenant_id, session)))
    .limit(1);
  if (!current) throw new PmError('NOT_FOUND', 'charter not found');
  if (current.status !== 'submitted') {
    throw new PmError('CONFLICT', 'charter is no longer editable');
  }
  if (input.expected_version !== undefined && input.expected_version !== current.version) {
    throw new PmError('CONFLICT', 'version mismatch');
  }

  const normalized: Record<string, unknown> = { ...patch };
  if (patch.budget_bmm !== undefined) normalized.budget_bmm = patch.budget_bmm?.toString();
  const entries = Object.entries(normalized).filter(([, v]) => v !== undefined);
  // Compare against the mapped column value; report the patch field name in the event.
  const changes = entries.filter(([f, v]) => {
    const col = FIELD_TO_COLUMN[f] ?? f;
    return JSON.stringify((current as Record<string, unknown>)[col]) !== JSON.stringify(v);
  });
  if (changes.length === 0) return { version: current.version };

  const nextVersion = current.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const set: Record<string, unknown> = { version: nextVersion, updated_at: new Date() };
      for (const [f, v] of changes) set[FIELD_TO_COLUMN[f] ?? f] = v;
      const updated = await tx
        .update(project)
        .set(set)
        .where(
          and(
            eq(project.id, charter_id),
            eq(project.version, current.version),
            eq(project.status, 'submitted'),
          ),
        )
        .returning({ id: project.id });
      if (updated.length === 0) throw new PmError('CONFLICT', 'charter was modified concurrently');
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'pm.charter',
        aggregateId: charter_id,
        eventType: PM_CHARTER_UPDATED,
        eventVersion: 1,
        payload: { charter_id, tenant_id: session.tenant_id, fields: changes.map(([f]) => f) },
      });
    },
  );
  return { version: nextVersion };
}
