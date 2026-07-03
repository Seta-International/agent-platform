CREATE SCHEMA "people";
--> statement-breakpoint
CREATE TABLE "people"."account_projection" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"am_worker_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."employment_period" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"start_date" date,
	"end_date" date,
	"lifecycle_stage" text DEFAULT 'preboarding' NOT NULL,
	"employment_type" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employment_period_lifecycle_stage_check" CHECK (lifecycle_stage IN ('preboarding', 'onboarding', 'probation', 'active', 'on_leave', 'offboarding', 'alumni', 'did_not_start'))
);
--> statement-breakpoint
CREATE TABLE "people"."org_unit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"head_worker_id" uuid,
	"sort" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_unit_kind_check" CHECK (kind IN ('executive', 'operation', 'function', 'delivery', 'pmo'))
);
--> statement-breakpoint
CREATE TABLE "people"."person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"bio" text,
	"original_hire_date" date,
	"seniority_date" date,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."person_skill" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"skill_name" text NOT NULL,
	"level" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_skill_level_check" CHECK (level BETWEEN 0 AND 5)
);
--> statement-breakpoint
CREATE TABLE "people"."project_projection" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."worker" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"employee_no" text,
	"full_name" text NOT NULL,
	"work_email" text,
	"dob" date,
	"gender" text,
	"phone" text,
	"emergency_contact" jsonb,
	"profile_completed_at" timestamp with time zone,
	"job_title" text,
	"org_unit_id" uuid,
	"availability_status" text DEFAULT 'available' NOT NULL,
	"ooo_until" timestamp with time zone,
	"work_start" time,
	"work_end" time,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worker_gender_check" CHECK (gender IN ('male', 'female', 'prefer_not_to_say')),
	CONSTRAINT "worker_availability_status_check" CHECK (availability_status IN ('available', 'busy', 'ooo'))
);
--> statement-breakpoint
CREATE TABLE "people"."worker_allocation_projection" (
	"allocation_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"worker_id" uuid,
	"project_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"account_name" text NOT NULL,
	"lead_worker_id" uuid,
	"date_from" date,
	"date_to" date,
	"planned_pct" numeric(10, 4),
	"bucket" text,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worker_alloc_bucket_check" CHECK (bucket IS NULL OR bucket IN ('billable', 'internal', 'bench'))
);
--> statement-breakpoint
CREATE TABLE "people"."worker_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"field" text,
	"from_val" jsonb,
	"to_val" jsonb,
	"by_user_id" uuid
);
--> statement-breakpoint
ALTER TABLE "people"."employment_period" ADD CONSTRAINT "employment_period_person_fk" FOREIGN KEY ("person_id") REFERENCES "people"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people"."org_unit" ADD CONSTRAINT "org_unit_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "people"."org_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people"."org_unit" ADD CONSTRAINT "org_unit_head_worker_fk" FOREIGN KEY ("head_worker_id") REFERENCES "people"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people"."person_skill" ADD CONSTRAINT "person_skill_person_fk" FOREIGN KEY ("person_id") REFERENCES "people"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people"."worker" ADD CONSTRAINT "worker_org_unit_id_org_unit_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "people"."org_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people"."worker" ADD CONSTRAINT "worker_person_fk" FOREIGN KEY ("person_id") REFERENCES "people"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people"."worker_history" ADD CONSTRAINT "worker_history_person_fk" FOREIGN KEY ("person_id") REFERENCES "people"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employment_period_uniq_seq" ON "people"."employment_period" USING btree ("tenant_id","person_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "employment_period_one_open" ON "people"."employment_period" USING btree ("person_id") WHERE end_date IS NULL;--> statement-breakpoint
CREATE INDEX "employment_period_by_person" ON "people"."employment_period" USING btree ("tenant_id","person_id");--> statement-breakpoint
CREATE INDEX "org_unit_by_parent" ON "people"."org_unit" USING btree ("tenant_id","parent_id");--> statement-breakpoint
CREATE INDEX "org_unit_by_head" ON "people"."org_unit" USING btree ("tenant_id","head_worker_id");--> statement-breakpoint
CREATE INDEX "person_by_tenant_user" ON "people"."person" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "person_skill_uniq" ON "people"."person_skill" USING btree ("tenant_id","person_id","skill_id");--> statement-breakpoint
CREATE INDEX "person_skill_by_person" ON "people"."person_skill" USING btree ("tenant_id","person_id");--> statement-breakpoint
CREATE INDEX "person_skill_by_skill" ON "people"."person_skill" USING btree ("tenant_id","skill_id");--> statement-breakpoint
CREATE INDEX "project_proj_by_account" ON "people"."project_projection" USING btree ("tenant_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "worker_uniq_person" ON "people"."worker" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "worker_uniq_employee_no_per_tenant" ON "people"."worker" USING btree ("tenant_id","employee_no") WHERE employee_no IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "worker_uniq_email_per_tenant" ON "people"."worker" USING btree ("tenant_id","work_email") WHERE work_email IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "worker_by_tenant_live" ON "people"."worker" USING btree ("tenant_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "worker_by_org_unit" ON "people"."worker" USING btree ("tenant_id","org_unit_id");--> statement-breakpoint
CREATE INDEX "worker_alloc_by_worker" ON "people"."worker_allocation_projection" USING btree ("tenant_id","worker_id");--> statement-breakpoint
CREATE INDEX "worker_alloc_by_account" ON "people"."worker_allocation_projection" USING btree ("tenant_id","account_id");--> statement-breakpoint
CREATE INDEX "worker_alloc_by_project" ON "people"."worker_allocation_projection" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "worker_history_by_person" ON "people"."worker_history" USING btree ("tenant_id","person_id","at");