import type { SessionScope } from '@seta/core';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { labels, taskLabels, tasks } from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';

export interface ListDistinctLabelsInput {
  session: SessionScope;
}

/**
 * Returns every distinct lowercase label name applied to non-deleted tasks in
 * the caller's tenant, sorted alphabetically. Used to ground LLM skill/label
 * extraction against the actual vocabulary rather than hallucinated variants.
 */
export async function listDistinctLabels(input: ListDistinctLabelsInput): Promise<string[]> {
  requirePermission(input.session, 'planner.task.read');

  const db = plannerDb();
  const rows = await db
    .selectDistinct({ name: sql<string>`lower(${labels.name})` })
    .from(taskLabels)
    .innerJoin(tasks, eq(tasks.id, taskLabels.task_id))
    .innerJoin(labels, eq(labels.id, taskLabels.label_id))
    .where(
      and(
        eq(tasks.tenant_id, input.session.tenant_id),
        isNull(tasks.deleted_at),
        isNull(labels.deleted_at),
      ),
    );

  return [...new Set(rows.map((r) => r.name).filter(Boolean))].sort();
}
