// rbac: delegates — createLabel (planner.plan.update) and applyLabel (planner.task.update) gate.
import type { SessionScope } from '@seta/core';
import { and, eq, isNull } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { labels as labelsTable } from '../db/schema.ts';
import { applyLabel } from './apply-label.ts';
import { createLabel } from './create-label.ts';

/**
 * Skills are modeled as labels. Find-or-create each label by name within the
 * plan, then apply it to the task. Used by task-creation paths that accept
 * skill/label names (agent createTask, dedup workflow).
 */
export async function applyLabelsByName(input: {
  plan_id: string;
  task_id: string;
  names: string[];
  session: SessionScope;
}): Promise<void> {
  const db = plannerDb();
  for (const name of input.names) {
    const [existing] = await db
      .select({ id: labelsTable.id })
      .from(labelsTable)
      .where(
        and(
          eq(labelsTable.tenant_id, input.session.tenant_id),
          eq(labelsTable.plan_id, input.plan_id),
          eq(labelsTable.name, name),
          isNull(labelsTable.deleted_at),
        ),
      )
      .limit(1);
    const labelId =
      existing?.id ??
      (
        await createLabel({
          plan_id: input.plan_id,
          name,
          color: '#9ca3af',
          session: input.session,
        })
      ).id;
    await applyLabel({ task_id: input.task_id, label_id: labelId, session: input.session });
  }
}
