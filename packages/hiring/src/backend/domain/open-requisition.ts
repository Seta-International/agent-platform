import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import type { OpenRequisitionInput } from '../../contracts.ts';
import { HIRING_REQUISITION_OPENED } from '../../events.ts';
import { requisition } from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';

export async function openRequisition(
  input: OpenRequisitionInput & { session: SessionScope },
): Promise<{ requisition_id: string }> {
  requirePermission(input.session, 'hiring.requisition.open');
  let result!: { requisition_id: string };
  await withEmit(
    { actor: { userId: input.session.user_id, tenantId: input.session.tenant_id } },
    async (tx) => {
      const [row] = await tx
        .insert(requisition)
        .values({
          tenant_id: input.session.tenant_id,
          title: input.title,
          kind: input.kind,
          role_title: input.role_title,
          grade: input.grade,
          account_id: input.account_id,
          resource_request_id: input.resource_request_id,
          position_id: input.position_id,
          owner_user_id: input.session.user_id,
        })
        .returning();
      if (!row) throw new Error('requisition insert returned no row');
      result = { requisition_id: row.id };
      await emit({
        tenantId: input.session.tenant_id,
        aggregateType: 'hiring.requisition',
        aggregateId: row.id,
        eventType: HIRING_REQUISITION_OPENED,
        eventVersion: 1,
        payload: {
          requisition_id: row.id,
          tenant_id: input.session.tenant_id,
          resource_request_id: input.resource_request_id,
        },
      });
    },
  );
  return result;
}
