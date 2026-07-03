-- Drizzle cannot model DEFERRABLE foreign keys. The workflow_run_events_seen
-- dedup row is inserted as the idempotency gate BEFORE its workflow_runs parent
-- exists (the run row is created later in the same run-started transaction), so
-- the FK must be validated at COMMIT rather than per-statement.
ALTER TABLE "agent"."workflow_run_events_seen"
  ALTER CONSTRAINT "workflow_run_events_seen_run_id_workflow_runs_run_id_fk"
  DEFERRABLE INITIALLY DEFERRED;
