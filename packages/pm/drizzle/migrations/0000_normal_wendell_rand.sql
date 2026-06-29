CREATE SCHEMA "pm";
--> statement-breakpoint
CREATE TABLE "pm"."account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"industry" text,
	"am_worker_id" uuid,
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
	"planned_pct" numeric,
	"minutes_per_day" integer,
	"weekday_mask" integer,
	"resource_request_id" uuid,
	"status" text DEFAULT 'placeholder' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allocation_bucket_check" CHECK (bucket IN ('billable','internal','bench')),
	CONSTRAINT "allocation_status_check" CHECK (status IN ('placeholder','tentative','committed')),
	CONSTRAINT "allocation_worker_rule_check" CHECK ((status = 'placeholder' AND worker_id IS NULL) OR (status IN ('tentative','committed') AND worker_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "pm"."project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"objective" text,
	"scope" jsonb,
	"budget_bmm" numeric,
	"pm_worker_id" uuid,
	"phase" text DEFAULT 'initiation' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"planner_group_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_phase_check" CHECK (phase IN ('initiation','discovery','execution','stabilize','uat','closed')),
	CONSTRAINT "project_status_check" CHECK (status IN ('active','on_hold','closed'))
);
--> statement-breakpoint
CREATE INDEX "account_by_tenant" ON "pm"."account" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "allocation_by_project" ON "pm"."allocation" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "allocation_open_demand" ON "pm"."allocation" USING btree ("tenant_id","status") WHERE worker_id IS NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "allocation_one_placeholder_per_request" ON "pm"."allocation" USING btree ("resource_request_id") WHERE resource_request_id IS NOT NULL AND worker_id IS NULL;--> statement-breakpoint
CREATE INDEX "project_by_account_status" ON "pm"."project" USING btree ("tenant_id","account_id","status");