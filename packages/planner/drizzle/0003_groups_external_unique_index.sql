-- hand-written: drizzle pgTable does not express partial unique index with multi-column predicate cleanly
CREATE UNIQUE INDEX groups_external_uniq
  ON planner.groups (external_source, external_id)
  WHERE external_source <> 'native' AND external_id IS NOT NULL AND deleted_at IS NULL;
