import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { listUsers } from '@seta/identity';
import { requestNotification } from '@seta/notifications';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq } from 'drizzle-orm';
import type { RejectCharterInput } from '../../contracts.ts';
import {
  PM_CHARTER_APPROVED,
  PM_CHARTER_PMO_SIGNED_OFF,
  PM_CHARTER_REJECTED,
  PM_PROJECT_ACCESS_CHANGED,
  PM_PROJECT_CREATED,
} from '../../events.ts';
import { pmDb } from '../db/client.ts';
import { project, projectAccess, projectApproval } from '../db/schema.ts';
import { PmError, requirePermission } from '../rbac.ts';

async function loadProject(project_id: string, session: SessionScope) {
  const [p] = await pmDb()
    .select({
      id: project.id,
      status: project.status,
      version: project.version,
      account_id: project.account_id,
      name: project.name,
      pm_person_id: project.pm_person_id,
      pmo_person_id: project.pmo_person_id,
      methodology: project.methodology,
      pricing_model: project.pricing_model,
      budget_bmm: project.budget_bmm,
      date_to: project.date_to,
      submitted_by_user_id: projectApproval.submitted_by_user_id,
    })
    .from(project)
    .leftJoin(
      projectApproval,
      and(
        eq(projectApproval.project_id, project.id),
        tenantScoped(projectApproval.tenant_id, session),
      ),
    )
    .where(and(eq(project.id, project_id), tenantScoped(project.tenant_id, session)))
    .limit(1);
  if (!p) throw new PmError('NOT_FOUND', 'charter not found');
  return p;
}

export async function pmoSignOffCharter(input: {
  charter_id: string;
  expected_version?: number;
  session: SessionScope;
}): Promise<{ version: number }> {
  const { charter_id, session } = input;
  requirePermission(session, 'pm.charter.pmo_signoff');
  const c = await loadProject(charter_id, session);
  if (c.status !== 'submitted') throw new PmError('CONFLICT', 'charter is not awaiting PMO review');
  if (input.expected_version !== undefined && input.expected_version !== c.version) {
    throw new PmError('CONFLICT', 'version mismatch');
  }
  const nextVersion = c.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const updated = await tx
        .update(project)
        .set({ status: 'pmo_approved', version: nextVersion, updated_at: new Date() })
        .where(
          and(
            eq(project.id, charter_id),
            eq(project.version, c.version),
            eq(project.status, 'submitted'),
          ),
        )
        .returning({ id: project.id });
      if (updated.length === 0) throw new PmError('CONFLICT', 'charter was modified concurrently');

      await tx
        .update(projectApproval)
        .set({
          pmo_signed_off_at: new Date(),
          pmo_signed_off_by_user_id: session.user_id,
          updated_at: new Date(),
        })
        .where(eq(projectApproval.project_id, charter_id));

      const { eventId } = await emit({
        tenantId: session.tenant_id,
        aggregateType: 'pm.charter',
        aggregateId: charter_id,
        eventType: PM_CHARTER_PMO_SIGNED_OFF,
        eventVersion: 1,
        payload: { charter_id, tenant_id: session.tenant_id },
      });

      const bod = await listUsers(session.tenant_id, {
        role_slug: 'pm.bod',
        limit: 500,
        offset: 0,
      });
      const recipients = bod.rows.map((u) => u.user_id).filter((id) => id !== session.user_id);
      await requestNotification({
        tenant_id: session.tenant_id,
        event_type: PM_CHARTER_PMO_SIGNED_OFF,
        user_ids: recipients,
        source_event_id: eventId,
        payload: {
          title: 'Charter awaiting BoD approval',
          body: `"${c.name}" passed PMO review`,
          charter_id,
        },
      });
    },
  );
  return { version: nextVersion };
}

export async function bodApproveCharter(input: {
  charter_id: string;
  expected_version?: number;
  session: SessionScope;
}): Promise<{ project_id: string; version: number }> {
  const { charter_id, session } = input;
  requirePermission(session, 'pm.charter.bod_approve');
  const c = await loadProject(charter_id, session);
  if (c.status !== 'pmo_approved') {
    throw new PmError('CONFLICT', 'charter is not awaiting BoD review');
  }
  if (input.expected_version !== undefined && input.expected_version !== c.version) {
    throw new PmError('CONFLICT', 'version mismatch');
  }
  if (!c.methodology || !c.pricing_model || c.budget_bmm == null) {
    throw new PmError('VALIDATION', 'charter missing methodology, pricing, or budget');
  }

  const nextVersion = c.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      // The project row already exists (created at submission) — approval is
      // activation, so we flip its status rather than inserting a new project.
      const activated = await tx
        .update(project)
        .set({ status: 'active', version: nextVersion, updated_at: new Date() })
        .where(
          and(
            eq(project.id, charter_id),
            eq(project.version, c.version),
            eq(project.status, 'pmo_approved'),
          ),
        )
        .returning({ id: project.id });
      if (activated.length === 0)
        throw new PmError('CONFLICT', 'charter was modified concurrently');

      await tx
        .update(projectApproval)
        .set({
          approved_at: new Date(),
          decided_by_user_id: session.user_id,
          updated_at: new Date(),
        })
        .where(eq(projectApproval.project_id, charter_id));

      if (c.pm_person_id) {
        await tx.insert(projectAccess).values({
          tenant_id: session.tenant_id,
          project_id: charter_id,
          person_id: c.pm_person_id,
          level: 'owner',
        });
        await emit({
          tenantId: session.tenant_id,
          aggregateType: 'pm.project',
          aggregateId: charter_id,
          eventType: PM_PROJECT_ACCESS_CHANGED,
          eventVersion: 1,
          payload: {
            project_id: charter_id,
            tenant_id: session.tenant_id,
            owner_worker_ids: [c.pm_person_id],
          },
        });
      }

      const { eventId: approvedEventId } = await emit({
        tenantId: session.tenant_id,
        aggregateType: 'pm.charter',
        aggregateId: charter_id,
        eventType: PM_CHARTER_APPROVED,
        eventVersion: 1,
        payload: { charter_id, tenant_id: session.tenant_id, project_id: charter_id },
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
            project_id: charter_id,
          },
        });
      }

      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'pm.project',
        aggregateId: charter_id,
        eventType: PM_PROJECT_CREATED,
        eventVersion: 1,
        payload: {
          project_id: charter_id,
          tenant_id: session.tenant_id,
          account_id: c.account_id,
          charter_id,
          name: c.name,
          date_to: c.date_to,
        },
      });
    },
  );
  return { project_id: charter_id, version: nextVersion };
}

export async function rejectCharter(
  input: RejectCharterInput & { session: SessionScope },
): Promise<{ version: number }> {
  const { charter_id, reason, session } = input;
  const c = await loadProject(charter_id, session);

  let stage: 'pmo' | 'bod';
  if (c.status === 'submitted') {
    requirePermission(session, 'pm.charter.pmo_signoff');
    stage = 'pmo';
  } else if (c.status === 'pmo_approved') {
    requirePermission(session, 'pm.charter.bod_approve');
    stage = 'bod';
  } else {
    throw new PmError('CONFLICT', 'charter is not rejectable');
  }

  if (input.expected_version !== undefined && input.expected_version !== c.version) {
    throw new PmError('CONFLICT', 'version mismatch');
  }
  const nextVersion = c.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const decided = await tx
        .update(project)
        .set({ status: 'rejected', version: nextVersion, updated_at: new Date() })
        .where(
          and(
            eq(project.id, charter_id),
            eq(project.version, c.version),
            eq(project.status, c.status),
          ),
        )
        .returning({ id: project.id });
      if (decided.length === 0) throw new PmError('CONFLICT', 'charter was modified concurrently');

      await tx
        .update(projectApproval)
        .set({
          rejected_at: new Date(),
          rejected_stage: stage,
          rejection_reason: reason,
          decided_by_user_id: session.user_id,
          updated_at: new Date(),
        })
        .where(eq(projectApproval.project_id, charter_id));

      const { eventId: rejectedEventId } = await emit({
        tenantId: session.tenant_id,
        aggregateType: 'pm.charter',
        aggregateId: charter_id,
        eventType: PM_CHARTER_REJECTED,
        eventVersion: 1,
        payload: { charter_id, tenant_id: session.tenant_id, reason, stage },
      });

      if (c.submitted_by_user_id && c.submitted_by_user_id !== session.user_id) {
        await requestNotification({
          tenant_id: session.tenant_id,
          event_type: PM_CHARTER_REJECTED,
          user_ids: [c.submitted_by_user_id],
          source_event_id: rejectedEventId,
          payload: { title: 'Charter rejected', body: reason, charter_id },
        });
      }
    },
  );
  return { version: nextVersion };
}
