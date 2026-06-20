import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { requestNotification } from '@seta/notifications';
import { and, eq } from 'drizzle-orm';
import type { RejectCharterInput } from '../../contracts.ts';
import { PM_CHARTER_APPROVED, PM_CHARTER_REJECTED, PM_PROJECT_CREATED } from '../../events.ts';
import { pmDb } from '../db/client.ts';
import { charter, project, projectAccess } from '../db/schema.ts';
import { tenantScoped } from '../db/scope.ts';
import { PmError, requirePermission } from '../rbac.ts';

async function loadSubmitted(charter_id: string, session: SessionScope) {
  const [c] = await pmDb()
    .select()
    .from(charter)
    .where(and(eq(charter.id, charter_id), tenantScoped(charter.tenant_id, session)))
    .limit(1);
  if (!c) throw new PmError('NOT_FOUND', 'charter not found');
  if (c.status !== 'submitted') throw new PmError('CONFLICT', 'charter already decided');
  return c;
}

export async function approveCharter(input: {
  charter_id: string;
  expected_version?: number;
  session: SessionScope;
}): Promise<{ project_id: string; version: number }> {
  const { charter_id, session } = input;
  requirePermission(session, 'pm.charter.approve');
  const c = await loadSubmitted(charter_id, session);
  if (input.expected_version !== undefined && input.expected_version !== c.version) {
    throw new PmError('CONFLICT', 'version mismatch');
  }

  // (F) completeness gate — reject before touching the DB
  if (!c.methodology || !c.pricing_model || c.budget_bmm == null) {
    throw new PmError('VALIDATION', 'charter missing methodology, pricing, or budget');
  }

  const nextVersion = c.version + 1;
  let projectId!: string;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const [proj] = await tx
        .insert(project)
        .values({
          tenant_id: session.tenant_id,
          account_id: c.account_id,
          charter_id: c.id,
          name: c.name,
          objective: c.objective,
          scope: c.scope as Record<string, unknown> | undefined,
          budget_bmm: c.budget_bmm ?? undefined,
          pm_worker_id: c.pm_worker_id,
          pmo_worker_id: c.pmo_worker_id ?? undefined,
          team_size: c.team_size ?? undefined,
          methodology: c.methodology ?? undefined,
          pricing_model: c.pricing_model ?? undefined,
          date_from: c.date_from ?? undefined,
          date_to: c.date_to ?? undefined,
          phase: 'initiation',
          status: 'active',
        })
        .returning({ id: project.id });
      if (!proj) throw new Error('project insert returned no row');
      projectId = proj.id;

      const decided = await tx
        .update(charter)
        .set({
          status: 'approved',
          approved_at: new Date(),
          project_id: proj.id,
          decided_by_user_id: session.user_id,
          version: nextVersion,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(charter.id, charter_id),
            eq(charter.version, c.version),
            eq(charter.status, 'submitted'),
          ),
        )
        .returning({ id: charter.id });
      if (decided.length === 0) throw new PmError('CONFLICT', 'charter was modified concurrently');

      if (c.pm_worker_id) {
        await tx.insert(projectAccess).values({
          tenant_id: session.tenant_id,
          project_id: proj.id,
          worker_id: c.pm_worker_id,
          level: 'owner',
        });
      }

      // (G) emit pm.charter.approved and notify submitter
      const { eventId: approvedEventId } = await emit({
        tenantId: session.tenant_id,
        aggregateType: 'pm.charter',
        aggregateId: charter_id,
        eventType: PM_CHARTER_APPROVED,
        eventVersion: 1,
        payload: { charter_id, tenant_id: session.tenant_id, project_id: proj.id },
      });

      if (c.submitted_by_user_id && c.submitted_by_user_id !== session.user_id) {
        await requestNotification({
          tenant_id: session.tenant_id,
          event_type: PM_CHARTER_APPROVED,
          user_ids: [c.submitted_by_user_id],
          source_event_id: approvedEventId,
          payload: {
            title: 'Charter approved',
            body: `"${c.name}" is now a live project`,
            charter_id,
            project_id: proj.id,
          },
        });
      }

      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'pm.project',
        aggregateId: proj.id,
        eventType: PM_PROJECT_CREATED,
        eventVersion: 1,
        payload: {
          project_id: proj.id,
          tenant_id: session.tenant_id,
          account_id: c.account_id,
          charter_id,
        },
      });
    },
  );
  return { project_id: projectId, version: nextVersion };
}

export async function rejectCharter(
  input: RejectCharterInput & { session: SessionScope },
): Promise<{ version: number }> {
  const { charter_id, reason, session } = input;
  requirePermission(session, 'pm.charter.approve');
  const c = await loadSubmitted(charter_id, session);
  if (input.expected_version !== undefined && input.expected_version !== c.version) {
    throw new PmError('CONFLICT', 'version mismatch');
  }
  const nextVersion = c.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const decided = await tx
        .update(charter)
        .set({
          status: 'rejected',
          rejection_reason: reason,
          rejected_at: new Date(),
          decided_by_user_id: session.user_id,
          version: nextVersion,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(charter.id, charter_id),
            eq(charter.version, c.version),
            eq(charter.status, 'submitted'),
          ),
        )
        .returning({ id: charter.id });
      if (decided.length === 0) throw new PmError('CONFLICT', 'charter was modified concurrently');

      const { eventId: rejectedEventId } = await emit({
        tenantId: session.tenant_id,
        aggregateType: 'pm.charter',
        aggregateId: charter_id,
        eventType: PM_CHARTER_REJECTED,
        eventVersion: 1,
        payload: { charter_id, tenant_id: session.tenant_id, reason },
      });

      if (c.submitted_by_user_id && c.submitted_by_user_id !== session.user_id) {
        await requestNotification({
          tenant_id: session.tenant_id,
          event_type: PM_CHARTER_REJECTED,
          user_ids: [c.submitted_by_user_id],
          source_event_id: rejectedEventId,
          payload: {
            title: 'Charter rejected',
            body: reason,
            charter_id,
          },
        });
      }
    },
  );
  return { version: nextVersion };
}
