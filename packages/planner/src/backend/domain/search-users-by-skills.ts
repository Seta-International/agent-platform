import type { SessionScope } from '@seta/core';
import { and, eq, isNull } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { assigneeProjection, groupMembers, groups } from '../db/schema.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';

export interface CandidateRow {
  userId: string;
  displayName: string;
  matchedSkills: string[];
  score: number;
}

export async function searchUsersBySkills(input: {
  group_id: string;
  skills: string[];
  limit: number;
  exclude_user_ids?: string[];
  session: SessionScope;
}): Promise<CandidateRow[]> {
  requirePermission(input.session, 'planner.group.member.read', input.group_id);

  const db = plannerDb();

  const [group] = await db
    .select()
    .from(groups)
    .where(and(eq(groups.id, input.group_id), isNull(groups.deleted_at)))
    .limit(1);

  if (!group) {
    throw new PlannerError('NOT_FOUND', 'Group not found', { group_id: input.group_id });
  }

  if (group.tenant_id !== input.session.tenant_id) {
    throw new PlannerError('CROSS_TENANT', 'Group belongs to another tenant', {
      group_id: input.group_id,
    });
  }

  const filter = groupFilterFor(input.session);
  if (filter !== null && !filter.includes(input.group_id)) {
    throw new PlannerError('FORBIDDEN', 'No access to group', { group_id: input.group_id });
  }

  const rows = await db
    .select({
      user_id: groupMembers.user_id,
      display_name: assigneeProjection.display_name,
      skills: assigneeProjection.skills,
    })
    .from(groupMembers)
    .innerJoin(assigneeProjection, eq(assigneeProjection.user_id, groupMembers.user_id))
    .where(eq(groupMembers.group_id, input.group_id));

  const candidates: CandidateRow[] = [];
  const excluded = new Set(input.exclude_user_ids ?? []);
  for (const row of rows) {
    if (excluded.has(row.user_id)) continue;
    const userSkills = row.skills ?? [];
    const normalizedInputSkills = input.skills.map((s) => s.toLowerCase());
    const matched = userSkills.filter((skill) =>
      normalizedInputSkills.includes(skill.toLowerCase()),
    );
    if (matched.length > 0) {
      candidates.push({
        userId: row.user_id,
        displayName: row.display_name,
        matchedSkills: matched,
        score: matched.length,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  return candidates.slice(0, input.limit);
}
