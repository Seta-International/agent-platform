import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import type { ProvisionWorkerInput } from '../../contracts.ts';
import { requirePermission } from '../rbac.ts';
import { insertWorkerAggregate } from './insert-worker-aggregate.ts';

export async function provisionWorker(
  input: ProvisionWorkerInput & { session: SessionScope },
): Promise<{ worker_id: string }> {
  requirePermission(input.session, 'people.worker.create');
  let result!: { worker_id: string };
  await withEmit(
    { actor: { userId: input.session.user_id, tenantId: input.session.tenant_id } },
    async (tx) => {
      result = await insertWorkerAggregate(tx, {
        tenant_id: input.session.tenant_id,
        by_user_id: input.session.user_id,
        full_name: input.full_name,
        start_date: input.start_date,
        employment_type: input.employment_type,
        history_action: 'provisioned',
      });
    },
  );
  return result;
}
