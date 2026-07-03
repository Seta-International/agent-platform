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
	"projection_built_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignee_projection_availability_status_check" CHECK (availability_status IN ('available', 'busy', 'ooo'))
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
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "buckets_external_source_check" CHECK (external_source IN ('native', 'm365'))
);
--> statement-breakpoint
CREATE TABLE "planner"."checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"label" text NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"order_hint" text,
	"external_id" text,
	"external_etag" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "planner"."group_join_requests" (
	"tenant_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_join_requests_tenant_id_group_id_user_id_pk" PRIMARY KEY("tenant_id","group_id","user_id"),
	CONSTRAINT "group_join_requests_status_check" CHECK (status IN ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "planner"."group_members" (
	"tenant_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"added_by" uuid NOT NULL,
	CONSTRAINT "group_members_tenant_id_group_id_user_id_pk" PRIMARY KEY("tenant_id","group_id","user_id"),
	CONSTRAINT "group_members_role_check" CHECK (role IN ('owner', 'member'))
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
	CONSTRAINT "groups_external_id_required_for_linked" CHECK (external_source = 'native' OR external_id IS NOT NULL),
	CONSTRAINT "groups_theme_check" CHECK (theme IN ('teal', 'purple', 'green', 'blue', 'pink', 'orange', 'red')),
	CONSTRAINT "groups_visibility_check" CHECK (visibility IN ('private', 'public')),
	CONSTRAINT "groups_default_role_check" CHECK (default_role IN ('owner', 'member')),
	CONSTRAINT "groups_external_source_check" CHECK (external_source IN ('native', 'm365'))
);
--> statement-breakpoint
CREATE TABLE "planner"."labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"category_slot" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "labels_category_slot_range" CHECK (category_slot IS NULL OR category_slot BETWEEN 1 AND 25)
);
--> statement-breakpoint
CREATE TABLE "planner"."plan_categories" (
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"slot" integer NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_categories_tenant_id_plan_id_slot_pk" PRIMARY KEY("tenant_id","plan_id","slot"),
	CONSTRAINT "plan_categories_plan_slot" UNIQUE("plan_id","slot"),
	CONSTRAINT "plan_categories_slot_check" CHECK (slot BETWEEN 1 AND 25),
	CONSTRAINT "plan_categories_name_check" CHECK (char_length(name) BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE TABLE "planner"."plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"external_source" text DEFAULT 'native' NOT NULL,
	"external_id" text,
	"external_etag" text,
	"external_synced_at" timestamp with time zone,
	"sync_status" text DEFAULT 'idle' NOT NULL,
	"last_error" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "plans_external_source_check" CHECK (external_source IN ('native', 'm365')),
	CONSTRAINT "plans_sync_status_check" CHECK (sync_status IN ('idle', 'pulling', 'pushing', 'error', 'conflict'))
);
--> statement-breakpoint
CREATE TABLE "planner"."task_assignments" (
	"tenant_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"order_hint" text,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"external_assigned_at" timestamp with time zone,
	"assigned_by" uuid NOT NULL,
	CONSTRAINT "task_assignments_task_id_user_id_pk" PRIMARY KEY("task_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "planner"."task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "task_comments_body_not_empty" CHECK (length(btrim(body)) > 0),
	CONSTRAINT "task_comments_body_max_len" CHECK (length(body) <= 4000)
);
--> statement-breakpoint
CREATE TABLE "planner"."task_labels" (
	"tenant_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_by" uuid NOT NULL,
	CONSTRAINT "task_labels_tenant_id_task_id_label_id_pk" PRIMARY KEY("tenant_id","task_id","label_id")
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
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_references_type_check" CHECK (type IN ('word', 'excel', 'powerPoint', 'visio', 'other', 'powerBI', 'oneNote', 'sharePoint', 'web', 'link'))
);
--> statement-breakpoint
CREATE TABLE "planner"."tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"bucket_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"description_text" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"progress" text DEFAULT 'not_started' NOT NULL,
	"is_deferred" boolean DEFAULT false NOT NULL,
	"preview_type" text DEFAULT 'automatic' NOT NULL,
	"review_state" text,
	"start_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"order_hint" text,
	"assignee_priority" text,
	"external_source" text DEFAULT 'native' NOT NULL,
	"external_id" text,
	"external_etag" text,
	"external_synced_at" timestamp with time zone,
	"sync_status" text DEFAULT 'idle' NOT NULL,
	"last_error" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "tasks_priority_check" CHECK (priority IN ('urgent', 'important', 'medium', 'low')),
	CONSTRAINT "tasks_progress_check" CHECK (progress IN ('not_started', 'in_progress', 'done')),
	CONSTRAINT "tasks_preview_type_check" CHECK (preview_type IN ('automatic', 'noPreview', 'checklist', 'description', 'reference')),
	CONSTRAINT "tasks_review_state_check" CHECK (review_state IN ('needs_review')),
	CONSTRAINT "tasks_external_source_check" CHECK (external_source IN ('native', 'm365')),
	CONSTRAINT "tasks_sync_status_check" CHECK (sync_status IN ('idle', 'pulling', 'pushing', 'error', 'conflict'))
);
--> statement-breakpoint
ALTER TABLE "planner"."buckets" ADD CONSTRAINT "buckets_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "planner"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner"."checklist_items" ADD CONSTRAINT "checklist_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "planner"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner"."group_join_requests" ADD CONSTRAINT "group_join_requests_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "planner"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner"."group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "planner"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner"."labels" ADD CONSTRAINT "labels_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "planner"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner"."labels" ADD CONSTRAINT "labels_category_slot_fk" FOREIGN KEY ("plan_id","category_slot") REFERENCES "planner"."plan_categories"("plan_id","slot") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner"."plan_categories" ADD CONSTRAINT "plan_categories_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "planner"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner"."plans" ADD CONSTRAINT "plans_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "planner"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner"."task_assignments" ADD CONSTRAINT "task_assignments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "planner"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner"."task_comments" ADD CONSTRAINT "task_comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "planner"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner"."task_labels" ADD CONSTRAINT "task_labels_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "planner"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner"."task_labels" ADD CONSTRAINT "task_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "planner"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner"."task_references" ADD CONSTRAINT "task_references_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "planner"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner"."tasks" ADD CONSTRAINT "tasks_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "planner"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner"."tasks" ADD CONSTRAINT "tasks_bucket_id_buckets_id_fk" FOREIGN KEY ("bucket_id") REFERENCES "planner"."buckets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignee_projection_by_tenant_active" ON "planner"."assignee_projection" USING btree ("tenant_id","deactivated_at");--> statement-breakpoint
CREATE INDEX "buckets_by_plan_hint" ON "planner"."buckets" USING btree ("tenant_id","plan_id","order_hint");--> statement-breakpoint
CREATE UNIQUE INDEX "buckets_external_uniq" ON "planner"."buckets" USING btree ("tenant_id","external_source","external_id") WHERE external_source <> 'native' AND external_id IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "checklist_items_by_task_hint" ON "planner"."checklist_items" USING btree ("task_id","order_hint");--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_items_external_uniq" ON "planner"."checklist_items" USING btree ("tenant_id","task_id","external_id") WHERE external_id IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "join_requests_by_group_pending" ON "planner"."group_join_requests" USING btree ("group_id","status");--> statement-breakpoint
CREATE INDEX "join_requests_by_user" ON "planner"."group_join_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "group_members_by_user" ON "planner"."group_members" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "groups_by_tenant_live" ON "planner"."groups" USING btree ("tenant_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_uniq_name_per_tenant" ON "planner"."groups" USING btree ("tenant_id","name") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "groups_external_uniq" ON "planner"."groups" USING btree ("tenant_id","external_source","external_id") WHERE external_source <> 'native' AND external_id IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "labels_by_plan_live" ON "planner"."labels" USING btree ("plan_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "labels_uniq_name_per_plan" ON "planner"."labels" USING btree ("tenant_id","plan_id","name") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "labels_category_slot_uniq" ON "planner"."labels" USING btree ("plan_id","category_slot") WHERE category_slot IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "plans_by_group_live" ON "planner"."plans" USING btree ("group_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_external_uniq" ON "planner"."plans" USING btree ("tenant_id","external_source","external_id") WHERE external_source <> 'native' AND external_id IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "task_assignments_by_user" ON "planner"."task_assignments" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "task_assignments_by_user_due" ON "planner"."task_assignments" USING btree ("tenant_id","user_id","assigned_at");--> statement-breakpoint
CREATE INDEX "task_assignments_by_task_hint" ON "planner"."task_assignments" USING btree ("task_id","order_hint");--> statement-breakpoint
CREATE INDEX "task_comments_by_task_recent" ON "planner"."task_comments" USING btree ("task_id","created_at" DESC NULLS LAST) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "task_labels_by_label" ON "planner"."task_labels" USING btree ("tenant_id","label_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_references_uniq_task_url" ON "planner"."task_references" USING btree ("tenant_id","task_id","url");--> statement-breakpoint
CREATE INDEX "task_references_by_task" ON "planner"."task_references" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "tasks_by_plan_live" ON "planner"."tasks" USING btree ("tenant_id","plan_id","deleted_at");--> statement-breakpoint
CREATE INDEX "tasks_by_bucket_hint" ON "planner"."tasks" USING btree ("tenant_id","bucket_id","order_hint") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "tasks_by_due_soon" ON "planner"."tasks" USING btree ("tenant_id","due_at") WHERE deleted_at IS NULL AND is_deferred = false AND progress <> 'done';--> statement-breakpoint
CREATE INDEX "tasks_by_review_state" ON "planner"."tasks" USING btree ("tenant_id","review_state") WHERE review_state IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "tasks_by_assignee_priority" ON "planner"."tasks" USING btree ("tenant_id","assignee_priority") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_external_uniq" ON "planner"."tasks" USING btree ("tenant_id","external_source","external_id") WHERE external_source <> 'native' AND external_id IS NOT NULL AND deleted_at IS NULL;