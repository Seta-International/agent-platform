-- hand-written migration (M3.2 PR2 Task 1)

-- Part 1: Fix M3.1 bug — task_embeddings.task_id should be uuid (tasks.id is uuid).
-- Safe to ALTER directly: no embeddings exist yet (M3.1 shipped a stub handler).
-- task_embeddings is PARTITION BY LIST; ALTER TYPE propagates to child partitions
-- automatically in Postgres 14+. No per-tenant children exist yet so this is a no-op
-- in terms of data conversion.
ALTER TABLE planner.task_embeddings
  ALTER COLUMN task_id TYPE uuid USING task_id::text::uuid;

-- Part 2: FTS column + GIN index on planner.tasks.
ALTER TABLE planner.tasks
  ADD COLUMN search_tsv tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(title, '')),       'A') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED;

CREATE INDEX tasks_search_tsv_gin_idx
  ON planner.tasks USING gin (search_tsv);
