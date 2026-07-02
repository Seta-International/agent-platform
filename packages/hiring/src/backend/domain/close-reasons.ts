import type { SessionScope } from '@seta/core';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq } from 'drizzle-orm';
import type { CloseReasonInput } from '../../contracts.ts';
import { hiringDb } from '../db/client.ts';
import { openingCloseReason } from '../db/schema.ts';
import { HiringError, requirePermission } from '../rbac.ts';

export async function createCloseReason(input: {
  input: CloseReasonInput;
  session: SessionScope;
}): Promise<{ id: string }> {
  const { session } = input;
  requirePermission(session, 'hiring.jd_template.manage');
  const [row] = await hiringDb()
    .insert(openingCloseReason)
    .values({ tenant_id: session.tenant_id, label: input.input.label })
    .returning({ id: openingCloseReason.id });
  if (!row) throw new Error('close_reason insert returned no row');
  return { id: row.id };
}

export async function listCloseReasons(session: SessionScope) {
  requirePermission(session, 'hiring.requisition.read');
  return hiringDb()
    .select()
    .from(openingCloseReason)
    .where(tenantScoped(openingCloseReason.tenant_id, session));
}

export async function archiveCloseReason(input: {
  id: string;
  expected_version?: number;
  session: SessionScope;
}): Promise<{ version: number }> {
  const { session, id } = input;
  requirePermission(session, 'hiring.jd_template.manage');
  const [cur] = await hiringDb()
    .select({ version: openingCloseReason.version })
    .from(openingCloseReason)
    .where(and(eq(openingCloseReason.id, id), tenantScoped(openingCloseReason.tenant_id, session)))
    .limit(1);
  if (!cur) throw new HiringError('NOT_FOUND', 'close reason not found');
  if (input.expected_version !== undefined && input.expected_version !== cur.version) {
    throw new HiringError('CONFLICT', 'version mismatch');
  }
  const next = cur.version + 1;
  const updated = await hiringDb()
    .update(openingCloseReason)
    .set({ active: false, version: next, updated_at: new Date() })
    .where(and(eq(openingCloseReason.id, id), eq(openingCloseReason.version, cur.version)))
    .returning({ id: openingCloseReason.id });
  if (updated.length === 0)
    throw new HiringError('CONFLICT', 'close reason was modified concurrently');
  return { version: next };
}
