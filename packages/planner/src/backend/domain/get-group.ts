import type { SessionScope } from '@seta/core';
import { eq } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { groups } from '../db/schema.ts';
import type { GroupRow } from '../dto.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';
import { isM365SystemActor } from './_actor.ts';
import { groupRowToDto } from './_group-dto.ts';

export async function getGroup(input: {
  group_id: string;
  session: SessionScope;
  include_deleted?: boolean;
}): Promise<GroupRow> {
  requirePermission(input.session, 'planner.group.read', input.group_id);

  const db = plannerDb();

  const [row] = await db.select().from(groups).where(eq(groups.id, input.group_id)).limit(1);

  if (!row || (row.deleted_at !== null && !input.include_deleted)) {
    throw new PlannerError('NOT_FOUND', 'Group not found', { group_id: input.group_id });
  }

  if (row.tenant_id !== input.session.tenant_id) {
    throw new PlannerError('CROSS_TENANT', 'Group belongs to another tenant', {
      group_id: input.group_id,
    });
  }

  const filter = groupFilterFor(input.session);
  if (filter !== null && !isM365SystemActor(input.session) && !filter.includes(input.group_id)) {
    throw new PlannerError('FORBIDDEN', 'No access to group', { group_id: input.group_id });
  }

  return groupRowToDto(row);
}
