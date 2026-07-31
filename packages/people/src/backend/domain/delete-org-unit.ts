import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, isNull } from 'drizzle-orm';
import { deleteOrgUnitInput } from '../../contracts.ts';
import { PEOPLE_ORG_UNIT_DELETED } from '../../events.ts';
import { orgUnit, person } from '../db/schema.ts';
import { PeopleError, requirePermission } from '../rbac.ts';
import { orgUnitWriteLock } from './org-unit-lock.ts';

export interface DeleteOrgUnitInput {
  org_unit_id: string;
  session: SessionScope;
}

/**
 * `org_unit_parent_fk` (parent_id) and `person_org_unit_id_org_unit_id_fk` (person.org_unit_id)
 * are both `NO ACTION` — real FK constraints, so a race can never corrupt data. But the checks
 * below only see *active* rows (has_children walks live org units; has_members filters
 * deleted_at IS NULL), while the FK constraint blocks on *any* referencing row. Map the
 * violation back to the same reason the pre-check would have reported.
 */
function mapForeignKeyViolation(err: unknown): 'has_children' | 'has_members' | undefined {
  // Drizzle wraps the driver error (DrizzleQueryError.cause) — walk the cause chain so both
  // wrapped and raw pg errors match.
  for (let e = err; e instanceof Error; e = e.cause as Error | undefined) {
    const pg = e as Error & { code?: string; constraint?: string };
    if (pg.code !== '23503') continue;
    if (pg.constraint === 'org_unit_parent_fk') return 'has_children';
    if (pg.constraint === 'person_org_unit_id_org_unit_id_fk') return 'has_members';
  }
  return undefined;
}

export async function deleteOrgUnit(
  input: DeleteOrgUnitInput,
): Promise<{ deleted: boolean; reason?: 'has_members' | 'has_children' }> {
  const { session } = input;
  requirePermission(session, 'people.worker.create');
  const { org_unit_id } = deleteOrgUnitInput.parse(input);

  let result: { deleted: boolean; reason?: 'has_members' | 'has_children' } = { deleted: false };
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      // Same lock as updateOrgUnit: serializes the has_children/has_members read-then-delete
      // against a concurrent updateOrgUnit re-parent (and against another deleteOrgUnit).
      await tx.execute(orgUnitWriteLock(session.tenant_id));

      const [current] = await tx
        .select({ id: orgUnit.id })
        .from(orgUnit)
        .where(and(eq(orgUnit.id, org_unit_id), tenantScoped(orgUnit.tenant_id, session)))
        .limit(1);
      if (!current) throw new PeopleError('NOT_FOUND', 'org unit not found');

      const children = await tx
        .select({ id: orgUnit.id })
        .from(orgUnit)
        .where(and(eq(orgUnit.parent_id, org_unit_id), tenantScoped(orgUnit.tenant_id, session)))
        .limit(1);
      if (children.length > 0) {
        result = { deleted: false, reason: 'has_children' };
        return;
      }

      const members = await tx
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
      if (members.length > 0) {
        result = { deleted: false, reason: 'has_members' };
        return;
      }

      try {
        // Nested transaction ⇒ SAVEPOINT: a caught 23503 rolls back only this statement, not
        // the whole withEmit transaction, so we can still commit an (empty) success below.
        await tx.transaction(async (tx2) => {
          await tx2
            .delete(orgUnit)
            .where(and(eq(orgUnit.id, org_unit_id), tenantScoped(orgUnit.tenant_id, session)));
        });
      } catch (err) {
        const reason = mapForeignKeyViolation(err);
        if (!reason) throw err;
        result = { deleted: false, reason };
        return;
      }

      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'people.org_unit',
        aggregateId: org_unit_id,
        eventType: PEOPLE_ORG_UNIT_DELETED,
        eventVersion: 1,
        payload: { org_unit_id, tenant_id: session.tenant_id },
      });
      result = { deleted: true };
    },
  );
  return result;
}
