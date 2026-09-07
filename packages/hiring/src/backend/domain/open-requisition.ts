import type { SessionScope } from '@seta/core';
import { emit, emitBatch, withEmit } from '@seta/core/events';
import { eq } from 'drizzle-orm';
import type { OpenRequisitionInput } from '../../contracts.ts';
import { HIRING_OPENING_OPENED, HIRING_REQUISITION_OPENED } from '../../events.ts';
import {
  opening,
  projectProjection,
  requisition,
  requisitionJdSection,
  requisitionSkill,
} from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';
import { assertProjectOpenForRequisition } from './assert-project-open-for-requisition.ts';

export async function openRequisition(
  input: OpenRequisitionInput & { session: SessionScope },
): Promise<{ requisition_id: string }> {
  const { session } = input;
  requirePermission(session, 'hiring.requisition.open');
  let result!: { requisition_id: string };
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      if (input.project_id) {
        const [proj] = await tx
          .select({ date_to: projectProjection.date_to })
          .from(projectProjection)
          .where(eq(projectProjection.project_id, input.project_id))
          .limit(1);
        assertProjectOpenForRequisition(
          proj?.date_to ?? null,
          new Date().toISOString().slice(0, 10),
        );
      }

      const [row] = await tx
        .insert(requisition)
        .values({
          tenant_id: session.tenant_id,
          title: input.title,
          kind: input.kind,
          role_title: input.role_title,
          grade: input.grade,
          account_id: input.account_id,
          project_id: input.project_id,
          due_date: input.due_date,
          start_date: input.start_date,
          note: input.note ?? deriveNote(input),
          default_interview_mode: input.default_interview_mode,
          approval_status: 'approved',
          owner_user_id: session.user_id,
        })
        .returning();
      if (!row) throw new Error('requisition insert returned no row');
      result = { requisition_id: row.id };

      if (input.jd_sections?.length) {
        await tx.insert(requisitionJdSection).values(
          input.jd_sections.map((s) => ({
            tenant_id: session.tenant_id,
            requisition_id: row.id,
            variant: s.variant,
            section: s.section,
            body: s.body,
          })),
        );
      }
      if (input.skills?.length) {
        await tx.insert(requisitionSkill).values(
          input.skills.map((s) => ({
            tenant_id: session.tenant_id,
            requisition_id: row.id,
            skill_id: s.skill_id,
            skill_name: s.skill_name,
            min_level: s.min_level,
          })),
        );
      }

      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'hiring.requisition',
        aggregateId: row.id,
        eventType: HIRING_REQUISITION_OPENED,
        eventVersion: 1,
        payload: { requisition_id: row.id, tenant_id: session.tenant_id },
      });

      const openings = await tx
        .insert(opening)
        .values(
          Array.from({ length: input.headcount ?? 1 }, (_, i) => ({
            tenant_id: session.tenant_id,
            requisition_id: row.id,
            seq: i + 1,
          })),
        )
        .returning({ id: opening.id });
      if (openings.length > 0) {
        await emitBatch(
          openings.map((op) => ({
            tenantId: session.tenant_id,
            aggregateType: 'hiring.opening',
            aggregateId: op.id,
            eventType: HIRING_OPENING_OPENED,
            eventVersion: 1,
            payload: { opening_id: op.id, requisition_id: row.id, tenant_id: session.tenant_id },
          })),
        );
      }
    },
  );
  return result;
}

function deriveNote(input: OpenRequisitionInput): string | undefined {
  const about = input.jd_sections?.find((s) => s.section === 'about' && s.variant === 'external');
  if (!about) return undefined;
  const text = about.body
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 70 ? `${text.slice(0, 70)}…` : text || undefined;
}
