import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, isNull } from 'drizzle-orm';
import { deleteOrgUnitInput } from '../../contracts.ts';
import { PEOPLE_ORG_UNIT_DELETED } from '../../events.ts';
import { peopleDb } from '../db/client.ts';
import { orgUnit, person } from '../db/schema.ts';
import { PeopleError, requirePermission } from '../rbac.ts';

export interface DeleteOrgUnitInput {
  org_unit_id: string;
  session: SessionScope;
}

export async function deleteOrgUnit(
  input: DeleteOrgUnitInput,
): Promise<{ deleted: boolean; reason?: 'has_members' | 'has_children' }> {
  const { session } = input;
  requirePermission(session, 'people.worker.create');
  const { org_unit_id } = deleteOrgUnitInput.parse(input);

  const [current] = await peopleDb()
    .select({ id: orgUnit.id })
    .from(orgUnit)
    .where(and(eq(orgUnit.id, org_unit_id), tenantScoped(orgUnit.tenant_id, session)))
    .limit(1);
  if (!current) throw new PeopleError('NOT_FOUND', 'org unit not found');

  const children = await peopleDb()
    .select({ id: orgUnit.id })
    .from(orgUnit)
    .where(and(eq(orgUnit.parent_id, org_unit_id), tenantScoped(orgUnit.tenant_id, session)))
    .limit(1);
  if (children.length > 0) return { deleted: false, reason: 'has_children' };

  const members = await peopleDb()
    .select({ id: person.id })
    .from(person)
    .where(
      and(
        eq(person.org_unit_id, org_unit_id),
        isNull(person.deleted_at),
        tenantScoped(person.tenant_id, session),
      ),
    )
    .limit(1);
  if (members.length > 0) return { deleted: false, reason: 'has_members' };

  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      await tx
        .delete(orgUnit)
        .where(and(eq(orgUnit.id, org_unit_id), tenantScoped(orgUnit.tenant_id, session)));

      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'people.org_unit',
        aggregateId: org_unit_id,
        eventType: PEOPLE_ORG_UNIT_DELETED,
        eventVersion: 1,
        payload: { org_unit_id, tenant_id: session.tenant_id },
      });
    },
  );
  return { deleted: true };
}
