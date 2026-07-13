import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { listUsers } from '@seta/identity';
import { requestNotification } from '@seta/notifications';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq } from 'drizzle-orm';
import type { SubmitCharterInput } from '../../contracts.ts';
import { PM_CHARTER_SUBMITTED } from '../../events.ts';
import { pmDb } from '../db/client.ts';
import { account, project, projectApproval } from '../db/schema.ts';
import { PmError, requirePermission } from '../rbac.ts';

export async function submitCharter(
  input: SubmitCharterInput & { session: SessionScope },
): Promise<{ project_id: string }> {
  const { session } = input;
  requirePermission(session, 'pm.charter.submit');

  // (B) app-layer referential integrity — schema is FK-free.
  const [acc] = await pmDb()
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.id, input.account_id), tenantScoped(account.tenant_id, session)))
    .limit(1);
  if (!acc) throw new PmError('NOT_FOUND', 'account not found');

  let result!: { project_id: string };
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const [row] = await tx
        .insert(project)
        .values({
          tenant_id: session.tenant_id,
          account_id: input.account_id,
          name: input.name,
          objective: input.objective,
          scope: input.scope,
          budget_bmm: input.budget_bmm?.toString(),
          pm_person_id: input.pm_worker_id,
          pmo_person_id: input.pmo_worker_id,
          team_size: input.team_size,
          methodology: input.methodology,
          pricing_model: input.pricing_model,
          date_from: input.date_from,
          date_to: input.date_to,
          status: 'submitted',
          phase: 'initiation',
        })
        .returning({ id: project.id });
      if (!row) throw new Error('project insert returned no row');
      result = { project_id: row.id };

      await tx.insert(projectApproval).values({
        project_id: row.id,
        tenant_id: session.tenant_id,
        submitted_by_user_id: session.user_id,
      });

      const { eventId } = await emit({
        tenantId: session.tenant_id,
        aggregateType: 'pm.charter',
        aggregateId: row.id,
        eventType: PM_CHARTER_SUBMITTED,
        eventVersion: 1,
        payload: { charter_id: row.id, tenant_id: session.tenant_id, account_id: input.account_id },
      });

      // (G) notify the PMO reviewers (first gate) — minus the submitter.
      const approvers = await listUsers(session.tenant_id, {
        role_slug: 'pm.pmo',
        limit: 500,
        offset: 0,
      });
      const recipients = approvers.rows
        .map((u) => u.user_id)
        .filter((id) => id !== session.user_id);
      await requestNotification({
        tenant_id: session.tenant_id,
        event_type: PM_CHARTER_SUBMITTED,
        user_ids: recipients,
        source_event_id: eventId,
        payload: {
          title: 'Charter submitted',
          body: `"${input.name}" needs review`,
          charter_id: row.id,
        },
      });
    },
  );
  return result;
}
