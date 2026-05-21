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
	"order_hint" text,
	"external_source" text DEFAULT 'native' NOT NULL,
	"external_id" text,
	"external_etag" text,
	"external_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "buckets_external_source_check" CHECK (external_source IN ('native','m365'))
);
--> statement-breakpoint
CREATE TABLE "planner"."checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"label" text NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"order_hint" text,
	"external_id" text,
	"external_etag" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planner"."group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"added_by" uuid NOT NULL,
	CONSTRAINT "group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id"),
	CONSTRAINT "group_members_role_check" CHECK (role IN ('owner','member'))
);
--> statement-breakpoint
CREATE TABLE "planner"."groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"theme" text DEFAULT 'blue' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"default_role" text DEFAULT 'member' NOT NULL,
	"external_source" text DEFAULT 'native' NOT NULL,
	"external_id" text,
	"external_synced_at" timestamp with time zone,
	"account_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "groups_theme_check" CHECK (theme IN ('teal','purple','green','blue','pink','orange','red')),
	CONSTRAINT "groups_visibility_check" CHECK (visibility IN ('private','public')),
	CONSTRAINT "groups_default_role_check" CHECK (default_role IN ('owner','member')),
	CONSTRAINT "groups_external_source_check" CHECK (external_source IN ('native','m365')),
	CONSTRAINT "groups_external_id_required_for_linked" CHECK (external_source = 'native' OR external_id IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "planner"."labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"category_slot" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "labels_category_slot_range" CHECK (category_slot IS NULL OR category_slot BETWEEN 1 AND 25)
);
--> statement-breakpoint
CREATE TABLE "planner"."plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category_descriptions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"external_source" text DEFAULT 'native' NOT NULL,
	"external_id" text,
	"external_etag" text,
	"external_synced_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "plans_external_source_check" CHECK (external_source IN ('native','m365'))
);
--> statement-breakpoint
CREATE TABLE "planner"."task_assignments" (
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"order_hint" text,
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
CREATE TABLE "planner"."task_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"url" text NOT NULL,
	"alias" text,
	"type" text DEFAULT 'other' NOT NULL,
	"preview_priority" text,
	"external_etag" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_references_type_check" CHECK (type IN ('word','excel','powerPoint','visio','other','powerBI','oneNote','sharePoint','web','link'))
);
--> statement-breakpoint
CREATE TABLE "planner"."tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"bucket_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"priority_number" integer DEFAULT 5 NOT NULL,
	"percent_complete" integer DEFAULT 0 NOT NULL,
	"is_deferred" boolean DEFAULT false NOT NULL,
	"preview_type" text DEFAULT 'automatic' NOT NULL,
	"review_state" text,
	"skill_tags" text[] DEFAULT '{}' NOT NULL,
	"start_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"order_hint" text,
	"assignee_priority" text,
	"external_source" text DEFAULT 'native' NOT NULL,
	"external_id" text,
	"external_etag" text,
	"external_synced_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "tasks_percent_complete_range" CHECK (percent_complete BETWEEN 0 AND 100),
	CONSTRAINT "tasks_priority_number_set" CHECK (priority_number IN (1,3,5,9)),
	CONSTRAINT "tasks_preview_type_check" CHECK (preview_type IN ('automatic','noPreview','checklist','description','reference')),
	CONSTRAINT "tasks_external_source_check" CHECK (external_source IN ('native','m365'))
);
--> statement-breakpoint
CREATE INDEX "assignee_projection_by_tenant_active" ON "planner"."assignee_projection" USING btree ("tenant_id","deactivated_at");--> statement-breakpoint
CREATE INDEX "buckets_by_plan_hint" ON "planner"."buckets" USING btree ("plan_id","order_hint");--> statement-breakpoint
CREATE INDEX "checklist_items_by_task_hint" ON "planner"."checklist_items" USING btree ("task_id","order_hint");--> statement-breakpoint
CREATE INDEX "group_members_by_user" ON "planner"."group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "groups_by_tenant_live" ON "planner"."groups" USING btree ("tenant_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_uniq_name_per_tenant" ON "planner"."groups" USING btree ("tenant_id","name") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "labels_by_plan_live" ON "planner"."labels" USING btree ("plan_id","deleted_at");--> statement-breakpoint
CREATE INDEX "plans_by_group_live" ON "planner"."plans" USING btree ("group_id","deleted_at");--> statement-breakpoint
CREATE INDEX "task_assignments_by_user" ON "planner"."task_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_assignments_by_task_hint" ON "planner"."task_assignments" USING btree ("task_id","order_hint");--> statement-breakpoint
CREATE INDEX "task_labels_by_label" ON "planner"."task_labels" USING btree ("label_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_references_uniq_task_url" ON "planner"."task_references" USING btree ("task_id","url");--> statement-breakpoint
CREATE INDEX "task_references_by_task" ON "planner"."task_references" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "tasks_by_plan_live" ON "planner"."tasks" USING btree ("tenant_id","plan_id","deleted_at");--> statement-breakpoint
CREATE INDEX "tasks_by_bucket_hint" ON "planner"."tasks" USING btree ("bucket_id","order_hint");--> statement-breakpoint
CREATE INDEX "tasks_by_due_soon" ON "planner"."tasks" USING btree ("tenant_id","due_at") WHERE deleted_at IS NULL AND is_deferred = false AND percent_complete < 100;--> statement-breakpoint
CREATE INDEX "tasks_by_skill_tags" ON "planner"."tasks" USING gin ("skill_tags");--> statement-breakpoint
CREATE INDEX "tasks_by_review_state" ON "planner"."tasks" USING btree ("tenant_id","review_state") WHERE review_state IS NOT NULL AND deleted_at IS NULL;