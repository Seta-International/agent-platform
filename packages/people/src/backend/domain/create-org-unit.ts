import type { SessionScope } from '@seta/core';
import { type CreateOrgUnitInput, createOrgUnitInput } from '../../contracts.ts';
import { peopleDb } from '../db/client.ts';
import { orgUnit } from '../db/schema.ts';
import { PeopleError, requirePermission } from '../rbac.ts';

export async function createOrgUnit(
  input: CreateOrgUnitInput & { session: SessionScope },
): Promise<{ org_unit_id: string }> {
  const { session } = input;
  requirePermission(session, 'people.worker.provision');
  const parsed = createOrgUnitInput.parse(input);

  const [u] = await peopleDb()
    .insert(orgUnit)
    .values({
      tenant_id: session.tenant_id,
      name: parsed.name,
      kind: parsed.kind,
      parent_id: parsed.parent_id ?? null,
      head_worker_id: parsed.head_worker_id ?? null,
      sort: parsed.sort ?? 0,
    })
    .returning({ id: orgUnit.id });
  if (!u) throw new PeopleError('VALIDATION', 'org_unit insert returned no row');
  return { org_unit_id: u.id };
}
