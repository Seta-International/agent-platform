import type { SessionScope } from '@seta/core';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq } from 'drizzle-orm';
import type { RejectionReasonInput } from '../../contracts.ts';
import { hiringDb } from '../db/client.ts';
import { reason } from '../db/schema.ts';
import { HiringError, requirePermission } from '../rbac.ts';

export async function createRejectionReason(input: {
  input: RejectionReasonInput;
  session: SessionScope;
}): Promise<{ id: string }> {
  const { session } = input;
  requirePermission(session, 'hiring.rejection_reason.manage');
  const [row] = await hiringDb()
    .insert(reason)
    .values({
      tenant_id: session.tenant_id,
      kind: 'rejection',
      label: input.input.label,
      category: input.input.category,
    })
    .returning({ id: reason.id });
  if (!row) throw new Error('rejection_reason insert returned no row');
  return { id: row.id };
}

export async function editRejectionReason(input: {
  id: string;
  expected_version?: number;
  input: RejectionReasonInput;
  session: SessionScope;
}): Promise<{ version: number }> {
  const { session, id } = input;
  requirePermission(session, 'hiring.rejection_reason.manage');
  const [cur] = await hiringDb()
    .select({ version: reason.version })
    .from(reason)
    .where(
      and(eq(reason.id, id), eq(reason.kind, 'rejection'), tenantScoped(reason.tenant_id, session)),
    )
    .limit(1);
  if (!cur) throw new HiringError('NOT_FOUND', 'rejection reason not found');
  if (input.expected_version !== undefined && input.expected_version !== cur.version)
    throw new HiringError('CONFLICT', 'version mismatch');
  const next = cur.version + 1;
  const updated = await hiringDb()
    .update(reason)
    .set({
      label: input.input.label,
      category: input.input.category,
      version: next,
      updated_at: new Date(),
    })
    .where(and(eq(reason.id, id), eq(reason.kind, 'rejection'), eq(reason.version, cur.version)))
    .returning({ id: reason.id });
  if (updated.length === 0) throw new HiringError('CONFLICT', 'reason was modified concurrently');
  return { version: next };
}

export async function archiveRejectionReason(input: {
  id: string;
  expected_version?: number;
  session: SessionScope;
}): Promise<{ version: number }> {
  const { session, id } = input;
  requirePermission(session, 'hiring.rejection_reason.manage');
  const [cur] = await hiringDb()
    .select({ version: reason.version })
    .from(reason)
    .where(
      and(eq(reason.id, id), eq(reason.kind, 'rejection'), tenantScoped(reason.tenant_id, session)),
    )
    .limit(1);
  if (!cur) throw new HiringError('NOT_FOUND', 'rejection reason not found');
  if (input.expected_version !== undefined && input.expected_version !== cur.version)
    throw new HiringError('CONFLICT', 'version mismatch');
  const next = cur.version + 1;
  const updated = await hiringDb()
    .update(reason)
    .set({ active: false, version: next, updated_at: new Date() })
    .where(and(eq(reason.id, id), eq(reason.kind, 'rejection'), eq(reason.version, cur.version)))
    .returning({ id: reason.id });
  if (updated.length === 0) throw new HiringError('CONFLICT', 'reason was modified concurrently');
  return { version: next };
}

export async function listRejectionReasons(session: SessionScope) {
  requirePermission(session, 'hiring.rejection_reason.read');
  return hiringDb()
    .select()
    .from(reason)
    .where(and(eq(reason.kind, 'rejection'), tenantScoped(reason.tenant_id, session)));
}
