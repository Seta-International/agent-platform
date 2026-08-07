CREATE TABLE "planner"."task_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source_task_id" uuid NOT NULL,
	"target_task_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_links_no_self" CHECK (source_task_id <> target_task_id),
	CONSTRAINT "task_links_kind_check" CHECK (kind IN ('relates', 'duplicates', 'blocks'))
);
--> statement-breakpoint
ALTER TABLE "planner"."task_links" ADD CONSTRAINT "task_links_source_task_id_tasks_id_fk" FOREIGN KEY ("source_task_id") REFERENCES "planner"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner"."task_links" ADD CONSTRAINT "task_links_target_task_id_tasks_id_fk" FOREIGN KEY ("target_task_id") REFERENCES "planner"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_links_by_source" ON "planner"."task_links" USING btree ("tenant_id","source_task_id");--> statement-breakpoint
CREATE INDEX "task_links_by_target" ON "planner"."task_links" USING btree ("tenant_id","target_task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_links_dup_source_uniq" ON "planner"."task_links" USING btree ("tenant_id","source_task_id") WHERE kind = 'duplicates';