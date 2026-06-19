CREATE SCHEMA "people";
--> statement-breakpoint
CREATE TABLE "people"."employment_period" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"start_date" date,
	"end_date" date,
	"status" text DEFAULT 'active' NOT NULL,
	"lifecycle_stage" text DEFAULT 'preboarding' NOT NULL,
	"employment_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employment_period_lifecycle_stage_check" CHECK (lifecycle_stage IN ('preboarding','onboarding','probation','active','on_leave','offboarding','alumni','did_not_start'))
);
--> statement-breakpoint
CREATE TABLE "people"."person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"original_hire_date" date,
	"seniority_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."worker" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"work_email" text,
	"dob" date,
	"gender" text,
	"phone" text,
	"emergency_contact" jsonb,
	"profile_completed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE UNIQUE INDEX "employment_period_uniq_seq" ON "people"."employment_period" USING btree ("tenant_id","person_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "employment_period_one_open" ON "people"."employment_period" USING btree ("person_id") WHERE end_date IS NULL;--> statement-breakpoint
CREATE INDEX "employment_period_by_person" ON "people"."employment_period" USING btree ("tenant_id","person_id");--> statement-breakpoint
CREATE INDEX "person_by_tenant_user" ON "people"."person" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "worker_uniq_person" ON "people"."worker" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "worker_uniq_email_per_tenant" ON "people"."worker" USING btree ("tenant_id","work_email") WHERE work_email IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "worker_by_tenant_live" ON "people"."worker" USING btree ("tenant_id","deleted_at");--> statement-breakpoint
CREATE INDEX "worker_history_by_person" ON "people"."worker_history" USING btree ("tenant_id","person_id","at");