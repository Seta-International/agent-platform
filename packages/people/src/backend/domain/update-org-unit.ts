import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, sql } from 'drizzle-orm';
import { updateOrgUnitInput } from '../../contracts.ts';
import { PEOPLE_ORG_UNIT_UPDATED } from '../../events.ts';
import { orgUnit } from '../db/schema.ts';
import { PeopleError, requirePermission } from '../rbac.ts';
import { orgUnitWriteLock } from './org-unit-lock.ts';

export interface UpdateOrgUnitInput {
  org_unit_id: string;
  patch: { name?: string; parent_id?: string | null; head_worker_id?: string | null };
  session: SessionScope;
}

export async function updateOrgUnit(input: UpdateOrgUnitInput): Promise<{ version: number }> {
  const { session } = input;
  requirePermission(session, 'people.org_unit.manage');
  const parsed = updateOrgUnitInput.parse(input);
  const { org_unit_id, patch } = parsed;

  if (patch.parent_id !== undefined && patch.parent_id !== null) {
    if (patch.parent_id === org_unit_id) {
      throw new PeopleError('CONFLICT', 'org unit cannot be its own parent');
    }
  }

  let nextVersion = 0;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      // Serialize org-unit structural writes per tenant: the cycle check below reads the tree
      // and the update writes it, and only holding this lock across both makes that read+write
      // atomic against a concurrent updateOrgUnit/deleteOrgUnit forming a cycle out from under us.
      await tx.execute(orgUnitWriteLock(session.tenant_id));

      const [current] = await tx
        .select()
        .from(orgUnit)
        .where(and(eq(orgUnit.id, org_unit_id), tenantScoped(orgUnit.tenant_id, session)))
        .limit(1);
      if (!current) throw new PeopleError('NOT_FOUND', 'org unit not found');

      // A unit cannot become its own ancestor: reportsSubtreeSql (worker-scope.ts) walks parent_id
      // via a recursive CTE, and a cycle there would recurse over org-unit membership forever.
      if (patch.parent_id !== undefined && patch.parent_id !== null) {
        const cycle = await tx.execute(sql`
          WITH RECURSIVE up AS (
            SELECT id, parent_id, 0 AS depth FROM people.org_unit
             WHERE id = ${patch.parent_id} AND tenant_id = ${session.tenant_id}
            UNION
            SELECT o.id, o.parent_id, up.depth + 1 FROM people.org_unit o
              JOIN up ON o.id = up.parent_id
             WHERE o.tenant_id = ${session.tenant_id}
               -- Termination is guaranteed by this depth cap ALONE. UNION dedup does not help
               -- here: depth is part of every row and strictly increases, so no two rows ever
               -- compare equal and UNION behaves as UNION ALL. Do not loosen the cap.
               AND up.depth < 1000
          )
          SELECT 1 FROM up WHERE id = ${org_unit_id} LIMIT 1
        `);
        if (cycle.rows.length > 0) {
          throw new PeopleError('CONFLICT', 'org unit parent change would create a cycle');
        }
      }

      nextVersion = current.version + 1;
      const updated = await tx
        .update(orgUnit)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.parent_id !== undefined ? { parent_id: patch.parent_id } : {}),
          ...(patch.head_worker_id !== undefined ? { head_worker_id: patch.head_worker_id } : {}),
          version: nextVersion,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(orgUnit.id, org_unit_id),
            eq(orgUnit.version, current.version),
            tenantScoped(orgUnit.tenant_id, session),
          ),
        )
        .returning({ id: orgUnit.id });
      if (updated.length === 0) {
        throw new PeopleError('CONFLICT', 'version mismatch', {
          current_version: current.version,
        });
      }

      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'people.org_unit',
        aggregateId: org_unit_id,
        eventType: PEOPLE_ORG_UNIT_UPDATED,
        eventVersion: 1,
        payload: {
          org_unit_id,
          tenant_id: session.tenant_id,
          name: patch.name ?? current.name,
          parent_id: patch.parent_id !== undefined ? patch.parent_id : current.parent_id,
          head_worker_id:
            patch.head_worker_id !== undefined ? patch.head_worker_id : current.head_worker_id,
        },
      });
    },
  );
  return { version: nextVersion };
}
