CREATE SCHEMA "pm";
--> statement-breakpoint
CREATE TABLE "pm"."account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"industry" text,
	"am_worker_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pm"."account_recruiter" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"recruiter_worker_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pm"."allocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"worker_id" uuid,
	"task_id" uuid,
	"role" text,
	"date_from" date,
	"date_to" date,
	"bucket" text DEFAULT 'billable' NOT NULL,
	"planned_pct" numeric(10, 4),
	"minutes_per_day" integer,
	"weekday_mask" integer,
	"note" text,
	"resource_request_id" uuid,
	"status" text DEFAULT 'placeholder' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allocation_bucket_check" CHECK (bucket IN ('billable', 'internal', 'bench')),
	CONSTRAINT "allocation_status_check" CHECK (status IN ('placeholder', 'tentative', 'committed')),
	CONSTRAINT "allocation_worker_rule_check" CHECK ((status = 'placeholder' AND worker_id IS NULL) OR (status IN ('tentative','committed') AND worker_id IS NOT NULL)),
	CONSTRAINT "allocation_committed_dates_check" CHECK (status = 'placeholder' OR date_from IS NOT NULL),
	CONSTRAINT "allocation_weekday_mask_check" CHECK (weekday_mask BETWEEN 0 AND 127),
	CONSTRAINT "allocation_planned_pct_check" CHECK (planned_pct >= 0 AND planned_pct <= 100)
);
--> statement-breakpoint
CREATE TABLE "pm"."charter" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"pm_worker_id" uuid NOT NULL,
	"submitted_by_user_id" uuid,
	"decided_by_user_id" uuid,
	"pmo_worker_id" uuid,
	"budget_bmm" numeric(15, 4),
	"team_size" integer,
	"methodology" text,
	"pricing_model" text,
	"date_from" date,
	"date_to" date,
	"objective" text,
	"scope" jsonb,
	"status" text DEFAULT 'submitted' NOT NULL,
	"rejection_reason" text,
	"rejected_stage" text,
	"pmo_signed_off_by_user_id" uuid,
	"pmo_signed_off_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"project_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "charter_status_check" CHECK (status IN ('submitted', 'pmo_approved', 'approved', 'rejected', 'withdrawn')),
	CONSTRAINT "charter_rejected_stage_check" CHECK (rejected_stage IN ('pmo', 'bod')),
	CONSTRAINT "charter_methodology_check" CHECK (methodology IN ('scrum', 'kanban')),
	CONSTRAINT "charter_pricing_model_check" CHECK (pricing_model IN ('fixed_price', 'time_materials'))
);
--> statement-breakpoint
CREATE TABLE "pm"."project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"objective" text,
	"scope" jsonb,
	"budget_bmm" numeric(15, 4),
	"pm_worker_id" uuid,
	"charter_id" uuid,
	"pmo_worker_id" uuid,
	"team_size" integer,
	"methodology" text,
	"pricing_model" text,
	"date_from" date,
	"date_to" date,
	"phase" text DEFAULT 'initiation' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"planner_group_id" uuid,
	"org_unit_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_phase_check" CHECK (phase IN ('initiation', 'discovery', 'execution', 'stabilize', 'uat', 'closed')),
	CONSTRAINT "project_status_check" CHECK (status IN ('active', 'on_hold', 'closed')),
	CONSTRAINT "project_methodology_check" CHECK (methodology IN ('scrum', 'kanban')),
	CONSTRAINT "project_pricing_model_check" CHECK (pricing_model IN ('fixed_price', 'time_materials'))
);
--> statement-breakpoint
CREATE TABLE "pm"."project_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"level" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_access_level_check" CHECK (level IN ('owner', 'edit', 'view'))
);
--> statement-breakpoint
CREATE TABLE "pm"."staffing_plan_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"role" text NOT NULL,
	"effort_mm" numeric(10, 4),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pm"."staffing_plan_line_skill" (
	"tenant_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"skill_name" text NOT NULL,
	"min_level" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staffing_plan_line_skill_tenant_id_line_id_skill_id_pk" PRIMARY KEY("tenant_id","line_id","skill_id"),
	CONSTRAINT "staffing_plan_line_skill_min_level_check" CHECK (min_level BETWEEN 0 AND 5)
);
--> statement-breakpoint
CREATE TABLE "pm"."worker_projection" (
	"worker_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"job_title" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pm"."account_recruiter" ADD CONSTRAINT "account_recruiter_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "pm"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm"."allocation" ADD CONSTRAINT "allocation_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "pm"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm"."charter" ADD CONSTRAINT "charter_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "pm"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm"."charter" ADD CONSTRAINT "charter_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "pm"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm"."project" ADD CONSTRAINT "project_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "pm"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm"."project" ADD CONSTRAINT "project_charter_id_charter_id_fk" FOREIGN KEY ("charter_id") REFERENCES "pm"."charter"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm"."project_access" ADD CONSTRAINT "project_access_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "pm"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm"."staffing_plan_line" ADD CONSTRAINT "staffing_plan_line_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "pm"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm"."staffing_plan_line_skill" ADD CONSTRAINT "staffing_plan_line_skill_line_id_staffing_plan_line_id_fk" FOREIGN KEY ("line_id") REFERENCES "pm"."staffing_plan_line"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_by_tenant" ON "pm"."account" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_recruiter_uniq" ON "pm"."account_recruiter" USING btree ("tenant_id","account_id","recruiter_worker_id");--> statement-breakpoint
CREATE INDEX "account_recruiter_by_account" ON "pm"."account_recruiter" USING btree ("tenant_id","account_id");--> statement-breakpoint
CREATE INDEX "account_recruiter_by_recruiter" ON "pm"."account_recruiter" USING btree ("tenant_id","recruiter_worker_id");--> statement-breakpoint
CREATE INDEX "allocation_by_project" ON "pm"."allocation" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "allocation_by_task" ON "pm"."allocation" USING btree ("tenant_id","task_id");--> statement-breakpoint
CREATE INDEX "allocation_by_worker" ON "pm"."allocation" USING btree ("tenant_id","worker_id") WHERE worker_id IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "allocation_open_demand" ON "pm"."allocation" USING btree ("tenant_id","status") WHERE worker_id IS NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "allocation_one_placeholder_per_request" ON "pm"."allocation" USING btree ("tenant_id","resource_request_id") WHERE resource_request_id IS NOT NULL AND worker_id IS NULL;--> statement-breakpoint
CREATE INDEX "charter_by_account_status" ON "pm"."charter" USING btree ("tenant_id","account_id","status");--> statement-breakpoint
CREATE INDEX "charter_by_tenant" ON "pm"."charter" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "charter_by_project" ON "pm"."charter" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "project_by_account_status" ON "pm"."project" USING btree ("tenant_id","account_id","status");--> statement-breakpoint
CREATE INDEX "project_by_org_unit" ON "pm"."project" USING btree ("tenant_id","org_unit_id");--> statement-breakpoint
CREATE INDEX "project_by_charter" ON "pm"."project" USING btree ("tenant_id","charter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_access_uniq" ON "pm"."project_access" USING btree ("tenant_id","project_id","worker_id");--> statement-breakpoint
CREATE INDEX "project_access_by_project" ON "pm"."project_access" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "staffing_plan_line_by_project" ON "pm"."staffing_plan_line" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "staffing_plan_line_skill_by_skill" ON "pm"."staffing_plan_line_skill" USING btree ("tenant_id","skill_id");--> statement-breakpoint
CREATE INDEX "worker_projection_by_name" ON "pm"."worker_projection" USING btree ("tenant_id","full_name");