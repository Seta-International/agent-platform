CREATE SCHEMA "planner";
--> statement-breakpoint
CREATE TABLE "planner"."assignee_projection" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"skills" text[] DEFAULT '{}' NOT NULL,
	"availability_status" text NOT NULL,
	"timezone" text NOT NULL,
	"ooo_until" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"projection_built_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planner"."buckets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planner"."checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"label" text NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"sort_order" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planner"."group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"added_by" uuid NOT NULL,
	CONSTRAINT "group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "planner"."groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"account_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planner"."labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "planner"."plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planner"."task_assignments" (
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" uuid NOT NULL,
	CONSTRAINT "task_assignments_task_id_user_id_pk" PRIMARY KEY("task_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "planner"."task_labels" (
	"task_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_by" uuid NOT NULL,
	CONSTRAINT "task_labels_task_id_label_id_pk" PRIMARY KEY("task_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "planner"."tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"bucket_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"progress" text DEFAULT 'not_started' NOT NULL,
	"review_state" text,
	"skill_tags" text[] DEFAULT '{}' NOT NULL,
	"due_at" timestamp with time zone,
	"sort_order" bigint NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "assignee_projection_by_tenant_active" ON "planner"."assignee_projection" USING btree ("tenant_id","deactivated_at");--> statement-breakpoint
CREATE INDEX "buckets_by_plan_order" ON "planner"."buckets" USING btree ("plan_id","sort_order");--> statement-breakpoint
CREATE INDEX "checklist_items_by_task_order" ON "planner"."checklist_items" USING btree ("task_id","sort_order");--> statement-breakpoint
CREATE INDEX "group_members_by_user" ON "planner"."group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "groups_by_tenant_live" ON "planner"."groups" USING btree ("tenant_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_uniq_name_per_tenant" ON "planner"."groups" USING btree ("tenant_id","name") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "labels_by_plan_live" ON "planner"."labels" USING btree ("plan_id","deleted_at");--> statement-breakpoint
CREATE INDEX "plans_by_group_live" ON "planner"."plans" USING btree ("group_id","deleted_at");--> statement-breakpoint
CREATE INDEX "task_assignments_by_user" ON "planner"."task_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_labels_by_label" ON "planner"."task_labels" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "tasks_by_plan_live" ON "planner"."tasks" USING btree ("tenant_id","plan_id","deleted_at");--> statement-breakpoint
CREATE INDEX "tasks_by_bucket_order" ON "planner"."tasks" USING btree ("bucket_id","sort_order");--> statement-breakpoint
CREATE INDEX "tasks_by_due_soon" ON "planner"."tasks" USING btree ("tenant_id","due_at") WHERE deleted_at IS NULL AND progress <> 'completed';--> statement-breakpoint
CREATE INDEX "tasks_by_skill_tags" ON "planner"."tasks" USING gin ("skill_tags");--> statement-breakpoint
CREATE INDEX "tasks_by_review_state" ON "planner"."tasks" USING btree ("tenant_id","review_state") WHERE review_state IS NOT NULL AND deleted_at IS NULL;