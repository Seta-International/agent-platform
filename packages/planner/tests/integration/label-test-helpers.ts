interface PoolLike {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
}

/**
 * Test-only helper: create plan-scoped labels by name and apply them to a task
 * via raw SQL (mirrors the seedProjection style). Skills are modeled as label
 * names since the skill_tags column was removed.
 */
export async function applyLabels(
  pool: PoolLike,
  opts: {
    tenant_id: string;
    plan_id: string;
    task_id: string;
    applied_by: string;
    names: string[];
  },
): Promise<void> {
  for (const name of opts.names) {
    // Labels are unique by (tenant_id, plan_id, name) among live rows; find-or-create so
    // applying the same name across multiple tasks in one plan reuses the label.
    const res = (await pool.query(
      `INSERT INTO planner.labels (tenant_id, plan_id, name, color)
       VALUES ($1, $2, $3, '#2563eb')
       ON CONFLICT (tenant_id, plan_id, name) WHERE deleted_at IS NULL
       DO UPDATE SET color = EXCLUDED.color
       RETURNING id`,
      [opts.tenant_id, opts.plan_id, name],
    )) as { rows: Array<{ id: string }> };
    const labelId = (res.rows[0] as { id: string }).id;
    await pool.query(
      `INSERT INTO planner.task_labels (tenant_id, task_id, label_id, applied_by)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [opts.tenant_id, opts.task_id, labelId, opts.applied_by],
    );
  }
}
