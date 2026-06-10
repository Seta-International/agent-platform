import type { SessionScope } from '@seta/core';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { tasks } from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';

export interface ListDistinctSkillTagsInput {
  session: SessionScope;
}

/**
 * Returns every distinct lowercase skill tag used by non-deleted tasks in the
 * caller's tenant, sorted alphabetically. Used to ground LLM tag extraction
 * against the actual vocabulary rather than hallucinated variants.
 */
export async function listDistinctSkillTags(input: ListDistinctSkillTagsInput): Promise<string[]> {
  requirePermission(input.session, 'planner.task.read');

  const db = plannerDb();
  const rows = await db
    .select({ tag: sql<string>`lower(unnest(${tasks.skill_tags}))` })
    .from(tasks)
    .where(and(eq(tasks.tenant_id, input.session.tenant_id), isNull(tasks.deleted_at)));

  return [...new Set(rows.map((r) => r.tag).filter(Boolean))].sort();
}
