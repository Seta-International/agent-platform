/** Fields whose churn is already represented by a `task.moved` event. */
const MOVE_TWIN_FIELDS = new Set(['order_hint', 'bucket_id', 'plan_id']);

function asObj(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

/**
 * Whether an audit event should appear in the group activity feed. Drops move/reorder
 * noise: same-bucket reorders, and the `task.updated` twin that every move also emits.
 */
export function isSignificant(eventType: string, payload: Record<string, unknown> | null): boolean {
  if (eventType === 'planner.task.moved') {
    if (!payload) return false;
    const fromPlan = payload.from_plan_id;
    const toPlan = payload.to_plan_id;
    if (typeof fromPlan === 'string' && typeof toPlan === 'string' && fromPlan !== toPlan) {
      return true; // cross-plan move
    }
    const before = asObj(payload.before);
    const after = asObj(payload.after);
    return (before?.bucket_id ?? null) !== (after?.bucket_id ?? null);
  }

  if (eventType === 'planner.task.updated') {
    const fields = Array.isArray(payload?.changed_fields)
      ? (payload?.changed_fields as string[])
      : [];
    if (fields.length === 0) return true; // defensive: keep when unknown
    return fields.some((f) => !MOVE_TWIN_FIELDS.has(f));
  }

  return true;
}
