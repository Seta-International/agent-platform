import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, inArray } from 'drizzle-orm';
import type { EditProjectInput } from '../../contracts.ts';
import { PM_PROJECT_UPDATED } from '../../events.ts';
import { pmDb } from '../db/client.ts';
import { LIVE_PROJECT_STATUSES, project } from '../db/schema.ts';
import { PmError, requirePermission } from '../rbac.ts';

async function applyProjectUpdate(
  session: SessionScope,
  project_id: string,
  expected_version: number | undefined,
  patch: Record<string, unknown>,
  opts?: { allowClosed?: boolean; requireClosed?: boolean },
): Promise<{ version: number }> {
  requirePermission(session, 'pm.project.manage');
  const [current] = await pmDb()
    .select()
    .from(project)
    .where(
      and(
        eq(project.id, project_id),
        tenantScoped(project.tenant_id, session),
        inArray(project.status, LIVE_PROJECT_STATUSES),
      ),
    )
    .limit(1);
  if (!current) throw new PmError('NOT_FOUND', 'project not found');
  if (opts?.requireClosed && current.status !== 'closed') {
    throw new PmError('CONFLICT', 'project is not closed');
  }
  if (!opts?.allowClosed && current.status === 'closed') {
    throw new PmError('CONFLICT', 'project is closed');
  }
  if (expected_version !== undefined && expected_version !== current.version) {
    throw new PmError('CONFLICT', 'version mismatch');
  }
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  const changes = entries.filter(
    ([f, v]) => JSON.stringify((current as Record<string, unknown>)[f]) !== JSON.stringify(v),
  );
  if (changes.length === 0) return { version: current.version };

  const nextVersion = current.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const set: Record<string, unknown> = { version: nextVersion, updated_at: new Date() };
      for (const [f, v] of changes) set[f] = v;
      const updated = await tx
        .update(project)
        .set(set)
        .where(and(eq(project.id, project_id), eq(project.version, current.version)))
        .returning({
          id: project.id,
          name: project.name,
          account_id: project.account_id,
          date_to: project.date_to,
        });
      if (updated.length === 0) throw new PmError('CONFLICT', 'project was modified concurrently');
      // updated.length === 0 throws above; index 0 always exists here
      // biome-ignore lint/style/noNonNullAssertion: guarded by length check above
      const updatedRow = updated[0]!;
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'pm.project',
        aggregateId: project_id,
        eventType: PM_PROJECT_UPDATED,
        eventVersion: 1,
        payload: {
          project_id,
          tenant_id: session.tenant_id,
          name: updatedRow.name,
          account_id: updatedRow.account_id,
          date_to: updatedRow.date_to,
          fields: changes.map(([f]) => f),
        },
      });
    },
  );
  return { version: nextVersion };
}

export async function editProject(
  input: EditProjectInput & { session: SessionScope },
): Promise<{ version: number }> {
  return applyProjectUpdate(input.session, input.project_id, input.expected_version, {
    ...input.patch,
  });
}

export async function closeProject(input: {
  project_id: string;
  expected_version?: number;
  session: SessionScope;
}): Promise<{ version: number }> {
  return applyProjectUpdate(
    input.session,
    input.project_id,
    input.expected_version,
    { status: 'closed', phase: 'closed' },
    { allowClosed: true },
  );
}

export async function linkPlannerGroup(input: {
  project_id: string;
  planner_group_id: string | null;
  expected_version?: number;
  session: SessionScope;
}): Promise<{ version: number }> {
  return applyProjectUpdate(input.session, input.project_id, input.expected_version, {
    planner_group_id: input.planner_group_id,
  });
}

export async function reopenProject(input: {
  project_id: string;
  expected_version?: number;
  session: SessionScope;
}): Promise<{ version: number }> {
  return applyProjectUpdate(
    input.session,
    input.project_id,
    input.expected_version,
    { status: 'active', phase: 'execution' },
    { allowClosed: true, requireClosed: true },
  );
}
