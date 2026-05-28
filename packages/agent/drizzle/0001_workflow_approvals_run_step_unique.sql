-- Drizzle cannot model: unique constraint on (run_id, step_id) needed for idempotent
-- ON CONFLICT targeting in lifecycle-hook.ts. Without this, gen_random_uuid() as PK
-- means ON CONFLICT DO NOTHING never fires, allowing duplicate approvals per suspension.
ALTER TABLE "agent"."workflow_approvals"
  ADD CONSTRAINT "workflow_approvals_run_step_unique" UNIQUE ("run_id", "step_id");
