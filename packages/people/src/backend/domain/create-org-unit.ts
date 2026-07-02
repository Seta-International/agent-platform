import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { type CreateOrgUnitInput, createOrgUnitInput } from '../../contracts.ts';
import { PEOPLE_ORG_UNIT_CREATED } from '../../events.ts';
import { orgUnit } from '../db/schema.ts';
import { PeopleError, requirePermission } from '../rbac.ts';

export async function createOrgUnit(
  input: CreateOrgUnitInput & { session: SessionScope },
): Promise<{ org_unit_id: string }> {
  const { session } = input;
  requirePermission(session, 'people.worker.create');
  const parsed = createOrgUnitInput.parse(input);

  let created!: { id: string; parent_id: string | null; name: string };
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const [u] = await tx
        .insert(orgUnit)
        .values({
          tenant_id: session.tenant_id,
          name: parsed.name,
          kind: parsed.kind,
          parent_id: parsed.parent_id ?? null,
          head_worker_id: parsed.head_worker_id ?? null,
          sort: parsed.sort ?? 0,
        })
        .returning({ id: orgUnit.id, parent_id: orgUnit.parent_id, name: orgUnit.name });
      if (!u) throw new PeopleError('VALIDATION', 'org_unit insert returned no row');
      created = u;

      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'people.org_unit',
        aggregateId: u.id,
        eventType: PEOPLE_ORG_UNIT_CREATED,
        eventVersion: 1,
        payload: {
          org_unit_id: u.id,
          tenant_id: session.tenant_id,
          parent_id: u.parent_id,
          name: u.name,
        },
      });
    },
  );
  return { org_unit_id: created.id };
}
