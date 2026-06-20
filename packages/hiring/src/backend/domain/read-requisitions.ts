import type { SessionScope } from '@seta/core';
import { and, eq, sql } from 'drizzle-orm';
import { hiringDb } from '../db/client.ts';
import {
  application,
  opening,
  requisition,
  requisitionJdSection,
  requisitionSkill,
} from '../db/schema.ts';
import { tenantScoped } from '../db/scope.ts';
import { HiringError, requirePermission } from '../rbac.ts';

export interface RequisitionListRow {
  id: string;
  title: string;
  account_id: string | null;
  grade: string | null;
  kind: string;
  stage: string;
  status: string;
  due_date: string | null;
  openings_total: number;
  openings_open: number;
  applicants_count: number;
  version: number;
}

export async function listRequisitions(session: SessionScope): Promise<RequisitionListRow[]> {
  requirePermission(session, 'hiring.requisition.read');
  const rows = await hiringDb()
    .select({
      id: requisition.id,
      title: requisition.title,
      account_id: requisition.account_id,
      grade: requisition.grade,
      kind: requisition.kind,
      stage: requisition.stage,
      status: requisition.status,
      due_date: requisition.due_date,
      openings_total: sql<number>`(SELECT count(*)::int FROM hiring.opening o WHERE o.requisition_id = "hiring"."requisition"."id")`,
      openings_open: sql<number>`(SELECT count(*)::int FROM hiring.opening o WHERE o.requisition_id = "hiring"."requisition"."id" AND o.status = 'open')`,
      applicants_count: sql<number>`(SELECT count(*)::int FROM hiring.application a WHERE a.requisition_id = "hiring"."requisition"."id")`,
      version: requisition.version,
    })
    .from(requisition)
    .where(tenantScoped(requisition.tenant_id, session));
  return rows;
}

export interface RequisitionDetail {
  requisition: typeof requisition.$inferSelect;
  openings: (typeof opening.$inferSelect)[];
  jd_sections: (typeof requisitionJdSection.$inferSelect)[];
  skills: (typeof requisitionSkill.$inferSelect)[];
  applicants: (typeof application.$inferSelect)[];
}

export async function getRequisition(input: {
  requisition_id: string;
  session: SessionScope;
}): Promise<RequisitionDetail> {
  const { session, requisition_id } = input;
  requirePermission(session, 'hiring.requisition.read');
  const [req] = await hiringDb()
    .select()
    .from(requisition)
    .where(and(eq(requisition.id, requisition_id), tenantScoped(requisition.tenant_id, session)))
    .limit(1);
  if (!req) throw new HiringError('NOT_FOUND', 'requisition not found');
  const [openings, jd_sections, skills, applicants] = await Promise.all([
    hiringDb().select().from(opening).where(eq(opening.requisition_id, requisition_id)),
    hiringDb()
      .select()
      .from(requisitionJdSection)
      .where(eq(requisitionJdSection.requisition_id, requisition_id)),
    hiringDb()
      .select()
      .from(requisitionSkill)
      .where(eq(requisitionSkill.requisition_id, requisition_id)),
    hiringDb().select().from(application).where(eq(application.requisition_id, requisition_id)),
  ]);
  return { requisition: req, openings, jd_sections, skills, applicants };
}
