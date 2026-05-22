ALTER TABLE "planner"."checklist_items" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "planner"."plans" ADD COLUMN "sync_status" text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "planner"."plans" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "planner"."task_assignments" ADD COLUMN "external_assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "planner"."tasks" ADD COLUMN "sync_status" text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "planner"."tasks" ADD COLUMN "last_error" text;--> statement-breakpoint
-- checklist_items_external_uniq existed from 0001 with predicate (external_id IS NOT NULL); recreate with deleted_at IS NULL clause
DROP INDEX "planner"."checklist_items_external_uniq";--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_items_external_uniq" ON "planner"."checklist_items" USING btree ("task_id","external_id") WHERE external_id IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
ALTER TABLE "planner"."plans" ADD CONSTRAINT "plans_sync_status_check" CHECK (sync_status IN ('idle','pulling','pushing','error','conflict'));--> statement-breakpoint
ALTER TABLE "planner"."tasks" ADD CONSTRAINT "tasks_sync_status_check" CHECK (sync_status IN ('idle','pulling','pushing','error','conflict'));
