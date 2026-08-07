-- drizzle cannot model: an index whose KEY is an expression (least/greatest).
--
-- Normalises the pair, so for a given `kind` a link exists in at most one
-- direction. Three consequences, all deliberate:
--   * it subsumes UNIQUE (tenant_id, source_task_id, target_task_id, kind),
--     which is therefore NOT declared in schema.ts;
--   * `relates(A,B)` + `relates(B,A)` is one symmetric fact, one row; the same
--     for `blocks`, where a mutual block is incoherent;
--   * it closes the two-opposite-merges race (FUT-805 design §8.6): the second
--     inserter waits on the first transaction's uncommitted index entry, then
--     raises 23505, which aborts its WHOLE transaction — so the second task is
--     never trashed.
--
-- `kind` is part of the key on purpose: dedup writes `relates` and a later merge
-- writes `duplicates` on the same pair, and both must be storable.
--
-- If you regenerate migrations, this file is NOT regenerated. Deleting it
-- silently removes the guard above.
CREATE UNIQUE INDEX IF NOT EXISTS task_links_pair_kind_uniq
  ON planner.task_links (
    tenant_id,
    least(source_task_id, target_task_id),
    greatest(source_task_id, target_task_id),
    kind
  );
