import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, inArray } from 'drizzle-orm';
import type { SetProjectAccessInput } from '../../contracts.ts';
import { PM_PROJECT_ACCESS_CHANGED } from '../../events.ts';
import { pmDb } from '../db/client.ts';
import { LIVE_PROJECT_STATUSES, project, projectAccess } from '../db/schema.ts';
import { PmError, requirePermission } from '../rbac.ts';

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

export async function listProjectAccess(input: { project_id: string; session: SessionScope }) {
  const { project_id, session } = input;
  requirePermission(session, 'pm.project.read');
  return pmDb()
    .select({ worker_id: projectAccess.person_id, level: projectAccess.level })
    .from(projectAccess)
    .where(
      and(eq(projectAccess.project_id, project_id), tenantScoped(projectAccess.tenant_id, session)),
    );
}

export async function setProjectAccess(
  input: SetProjectAccessInput & { session: SessionScope },
): Promise<{ added: number; removed: number; changed: number }> {
  const { session, project_id, grants } = input;
  requirePermission(session, 'pm.project.manage');
  await assertProject(project_id, session);

  const existing = await pmDb()
    .select({ worker_id: projectAccess.person_id, level: projectAccess.level })
    .from(projectAccess)
    .where(
      and(eq(projectAccess.project_id, project_id), tenantScoped(projectAccess.tenant_id, session)),
    );

  if (grants.length === 0 && existing.length === 0) return { added: 0, removed: 0, changed: 0 };

  // (Δ C) the desired set must retain at least one owner
  if (!grants.some((g) => g.level === 'owner')) {
    throw new PmError('VALIDATION', 'project must retain at least one owner');
  }

  const existingMap = new Map(existing.map((e) => [e.worker_id, e.level]));
  const desiredMap = new Map(grants.map((g) => [g.worker_id, g.level]));

  let added = 0;
  let removed = 0;
  let changed = 0;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      for (const g of grants) {
        const prior = existingMap.get(g.worker_id);
        if (prior === g.level) continue;
        // Level changed or new worker: upsert. onConflictDoUpdate handles level changes in place.
        await tx
          .insert(projectAccess)
          .values({
            tenant_id: session.tenant_id,
            project_id,
            person_id: g.worker_id,
            level: g.level,
          })
          .onConflictDoUpdate({
            target: [projectAccess.tenant_id, projectAccess.project_id, projectAccess.person_id],
            set: { level: g.level, updated_at: new Date() },
          });
        if (prior === undefined) added += 1;
        else changed += 1;
      }
      for (const e of existing) {
        if (desiredMap.has(e.worker_id)) continue;
        await tx
          .delete(projectAccess)
          .where(
            and(
              eq(projectAccess.project_id, project_id),
              eq(projectAccess.person_id, e.worker_id),
              eq(projectAccess.tenant_id, session.tenant_id),
            ),
          );
        removed += 1;
      }
      if (added + removed + changed > 0) {
        await emit({
          tenantId: session.tenant_id,
          aggregateType: 'pm.project',
          aggregateId: project_id,
          eventType: PM_PROJECT_ACCESS_CHANGED,
          eventVersion: 1,
          payload: {
            project_id,
            tenant_id: session.tenant_id,
            owner_worker_ids: grants.filter((g) => g.level === 'owner').map((g) => g.worker_id),
          },
        });
      }
    },
  );
  return { added, removed, changed };
}
