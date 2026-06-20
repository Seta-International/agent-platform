import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { and, eq } from 'drizzle-orm';
import type { JdSectionInput, SkillInput } from '../../contracts.ts';
import { HIRING_REQUISITION_UPDATED } from '../../events.ts';
import { hiringDb } from '../db/client.ts';
import { requisition, requisitionJdSection, requisitionSkill } from '../db/schema.ts';
import { tenantScoped } from '../db/scope.ts';
import { HiringError, requirePermission } from '../rbac.ts';

async function loadAndGuard(
  requisition_id: string,
  expected: number | undefined,
  session: SessionScope,
) {
  const [current] = await hiringDb()
    .select({ version: requisition.version })
    .from(requisition)
    .where(and(eq(requisition.id, requisition_id), tenantScoped(requisition.tenant_id, session)))
    .limit(1);
  if (!current) throw new HiringError('NOT_FOUND', 'requisition not found');
  if (expected !== undefined && expected !== current.version) {
    throw new HiringError('CONFLICT', 'version mismatch');
  }
  return current.version;
}

export async function setRequisitionJd(input: {
  requisition_id: string;
  expected_version?: number;
  sections: JdSectionInput[];
  session: SessionScope;
}): Promise<{ version: number }> {
  const { session, requisition_id } = input;
  requirePermission(session, 'hiring.requisition.manage');
  const cur = await loadAndGuard(requisition_id, input.expected_version, session);
  const next = cur + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const bumped = await tx
        .update(requisition)
        .set({ version: next, updated_at: new Date() })
        .where(and(eq(requisition.id, requisition_id), eq(requisition.version, cur)))
        .returning({ id: requisition.id });
      if (bumped.length === 0)
        throw new HiringError('CONFLICT', 'requisition was modified concurrently');
      await tx
        .delete(requisitionJdSection)
        .where(eq(requisitionJdSection.requisition_id, requisition_id));
      if (input.sections.length) {
        await tx.insert(requisitionJdSection).values(
          input.sections.map((s) => ({
            tenant_id: session.tenant_id,
            requisition_id,
            variant: s.variant,
            section: s.section,
            body: s.body,
          })),
        );
      }
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'hiring.requisition',
        aggregateId: requisition_id,
        eventType: HIRING_REQUISITION_UPDATED,
        eventVersion: 1,
        payload: { requisition_id, tenant_id: session.tenant_id, fields: ['jd'] },
      });
    },
  );
  return { version: next };
}

export async function setRequisitionSkills(input: {
  requisition_id: string;
  expected_version?: number;
  skills: SkillInput[];
  session: SessionScope;
}): Promise<{ version: number }> {
  const { session, requisition_id } = input;
  requirePermission(session, 'hiring.requisition.manage');
  const cur = await loadAndGuard(requisition_id, input.expected_version, session);
  const next = cur + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const bumped = await tx
        .update(requisition)
        .set({ version: next, updated_at: new Date() })
        .where(and(eq(requisition.id, requisition_id), eq(requisition.version, cur)))
        .returning({ id: requisition.id });
      if (bumped.length === 0)
        throw new HiringError('CONFLICT', 'requisition was modified concurrently');
      await tx.delete(requisitionSkill).where(eq(requisitionSkill.requisition_id, requisition_id));
      if (input.skills.length) {
        await tx.insert(requisitionSkill).values(
          input.skills.map((s) => ({
            tenant_id: session.tenant_id,
            requisition_id,
            skill_id: s.skill_id,
            skill_name: s.skill_name,
            min_level: s.min_level,
          })),
        );
      }
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'hiring.requisition',
        aggregateId: requisition_id,
        eventType: HIRING_REQUISITION_UPDATED,
        eventVersion: 1,
        payload: { requisition_id, tenant_id: session.tenant_id, fields: ['skills'] },
      });
    },
  );
  return { version: next };
}
