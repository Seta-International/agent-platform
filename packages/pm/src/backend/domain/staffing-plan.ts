import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, inArray } from 'drizzle-orm';
import type { StaffingPlanLineInput, StaffingPlanLineSkillInput } from '../../contracts.ts';
import { PM_PROJECT_STAFFING_PLAN_CHANGED } from '../../events.ts';
import { pmDb } from '../db/client.ts';
import {
  LIVE_PROJECT_STATUSES,
  project,
  staffingPlanLine,
  staffingPlanLineSkill,
} from '../db/schema.ts';
import { PmError, requirePermission } from '../rbac.ts';

export interface StaffingPlanLineSkillRow {
  skill_id: string;
  skill_name: string;
  min_level: number | null;
}

export interface StaffingPlanLineRow {
  line_id: string;
  role: string;
  effort_mm: string | null;
  version: number;
  skills: StaffingPlanLineSkillRow[];
}

// Full-replace within the same transaction: delete-all + insert-all is fine at this
// volume (a handful of skills per staffing-plan line). `skills === undefined` means
// the caller omitted the field entirely — leave existing child rows untouched.
async function replaceLineSkills(
  tx: Parameters<Parameters<typeof withEmit>[1]>[0],
  session: SessionScope,
  line_id: string,
  skills: StaffingPlanLineSkillInput[] | undefined,
): Promise<void> {
  if (skills === undefined) return;
  await tx
    .delete(staffingPlanLineSkill)
    .where(
      and(
        eq(staffingPlanLineSkill.line_id, line_id),
        eq(staffingPlanLineSkill.tenant_id, session.tenant_id),
      ),
    );
  if (skills.length === 0) return;
  await tx.insert(staffingPlanLineSkill).values(
    skills.map((s) => ({
      tenant_id: session.tenant_id,
      line_id,
      skill_id: s.skill_id,
      skill_name: s.skill_name,
      min_level: s.min_level ?? null,
    })),
  );
}

async function assertProject(project_id: string, session: SessionScope) {
  const [p] = await pmDb()
    .select({ id: project.id })
    .from(project)
    .where(
      and(
        eq(project.id, project_id),
        tenantScoped(project.tenant_id, session),
        inArray(project.status, LIVE_PROJECT_STATUSES),
      ),
    )
    .limit(1);
  if (!p) throw new PmError('NOT_FOUND', 'project not found');
}

async function emitStaffingChanged(
  _tx: Parameters<Parameters<typeof withEmit>[1]>[0],
  session: SessionScope,
  project_id: string,
) {
  await emit({
    tenantId: session.tenant_id,
    aggregateType: 'pm.project',
    aggregateId: project_id,
    eventType: PM_PROJECT_STAFFING_PLAN_CHANGED,
    eventVersion: 1,
    payload: { project_id, tenant_id: session.tenant_id },
  });
}

export async function listStaffingPlan(input: {
  project_id: string;
  session: SessionScope;
}): Promise<StaffingPlanLineRow[]> {
  const { project_id, session } = input;
  requirePermission(session, 'pm.project.read');
  const lines = await pmDb()
    .select({
      line_id: staffingPlanLine.id,
      role: staffingPlanLine.role,
      effort_mm: staffingPlanLine.effort_mm,
      version: staffingPlanLine.version,
    })
    .from(staffingPlanLine)
    .where(
      and(
        eq(staffingPlanLine.project_id, project_id),
        tenantScoped(staffingPlanLine.tenant_id, session),
      ),
    );
  if (lines.length === 0) return [];

  const lineIds = lines.map((l) => l.line_id);
  const skillRows = await pmDb()
    .select({
      line_id: staffingPlanLineSkill.line_id,
      skill_id: staffingPlanLineSkill.skill_id,
      skill_name: staffingPlanLineSkill.skill_name,
      min_level: staffingPlanLineSkill.min_level,
    })
    .from(staffingPlanLineSkill)
    .where(
      and(
        inArray(staffingPlanLineSkill.line_id, lineIds),
        tenantScoped(staffingPlanLineSkill.tenant_id, session),
      ),
    );
  const skillsByLine = new Map<string, StaffingPlanLineSkillRow[]>();
  for (const s of skillRows) {
    const arr = skillsByLine.get(s.line_id) ?? [];
    arr.push({ skill_id: s.skill_id, skill_name: s.skill_name, min_level: s.min_level });
    skillsByLine.set(s.line_id, arr);
  }
  return lines.map((l) => ({ ...l, skills: skillsByLine.get(l.line_id) ?? [] }));
}

export async function upsertStaffingPlanLine(
  input: StaffingPlanLineInput & { session: SessionScope },
): Promise<{ line_id: string; version: number }> {
  const { session, project_id, line_id } = input;
  requirePermission(session, 'pm.project.manage');
  await assertProject(project_id, session);

  let resultId = line_id ?? '';
  let resultVersion = 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      if (!line_id) {
        const [row] = await tx
          .insert(staffingPlanLine)
          .values({
            tenant_id: session.tenant_id,
            project_id,
            role: input.role,
            effort_mm: input.effort_mm?.toString(),
          })
          .returning({ id: staffingPlanLine.id, version: staffingPlanLine.version });
        if (!row) throw new Error('staffing line insert returned no row');
        resultId = row.id;
        resultVersion = row.version;
        await replaceLineSkills(tx, session, resultId, input.skills);
      } else {
        const [current] = await tx
          .select()
          .from(staffingPlanLine)
          .where(
            and(
              eq(staffingPlanLine.id, line_id),
              tenantScoped(staffingPlanLine.tenant_id, session),
            ),
          )
          .limit(1);
        if (!current) throw new PmError('NOT_FOUND', 'staffing line not found');
        if (input.expected_version !== undefined && input.expected_version !== current.version) {
          throw new PmError('CONFLICT', 'version mismatch');
        }
        resultVersion = current.version + 1;
        const updated = await tx
          .update(staffingPlanLine)
          .set({
            role: input.role,
            effort_mm: input.effort_mm?.toString(),
            version: resultVersion,
            updated_at: new Date(),
          })
          .where(
            and(eq(staffingPlanLine.id, line_id), eq(staffingPlanLine.version, current.version)),
          )
          .returning({ id: staffingPlanLine.id });
        if (updated.length === 0)
          throw new PmError('CONFLICT', 'staffing line was modified concurrently');
        await replaceLineSkills(tx, session, line_id, input.skills);
      }
      await emitStaffingChanged(tx, session, project_id);
    },
  );
  return { line_id: resultId, version: resultVersion };
}

export async function deleteStaffingPlanLine(input: {
  project_id: string;
  line_id: string;
  expected_version?: number;
  session: SessionScope;
}): Promise<{ deleted: boolean }> {
  const { session, project_id, line_id } = input;
  requirePermission(session, 'pm.project.manage');
  await assertProject(project_id, session);

  let deleted = false;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const rows = await tx
        .delete(staffingPlanLine)
        .where(
          and(
            eq(staffingPlanLine.id, line_id),
            eq(staffingPlanLine.project_id, project_id),
            eq(staffingPlanLine.tenant_id, session.tenant_id),
            ...(input.expected_version !== undefined
              ? [eq(staffingPlanLine.version, input.expected_version)]
              : []),
          ),
        )
        .returning({ id: staffingPlanLine.id });
      deleted = rows.length > 0;
      if (input.expected_version !== undefined && !deleted) {
        throw new PmError('CONFLICT', 'version mismatch');
      }
      if (deleted) await emitStaffingChanged(tx, session, project_id);
    },
  );
  return { deleted };
}
