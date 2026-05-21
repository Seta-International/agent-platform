-- hand-written: drizzle pgTable cannot express partial unique with multi-column predicate
CREATE UNIQUE INDEX tasks_external_uniq
  ON planner.tasks (external_source, external_id)
  WHERE external_source <> 'native' AND external_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX buckets_external_uniq
  ON planner.buckets (external_source, external_id)
  WHERE external_source <> 'native' AND external_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX plans_external_uniq
  ON planner.plans (external_source, external_id)
  WHERE external_source <> 'native' AND external_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX labels_category_slot_uniq
  ON planner.labels (plan_id, category_slot)
  WHERE category_slot IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX checklist_items_external_uniq
  ON planner.checklist_items (task_id, external_id)
  WHERE external_id IS NOT NULL;
