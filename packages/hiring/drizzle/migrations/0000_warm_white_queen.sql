CREATE SCHEMA "hiring";
--> statement-breakpoint
CREATE TABLE "hiring"."application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"requisition_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"candidate_id" uuid,
	"worker_id" uuid,
	"stage" text,
	"status" text,
	"rating" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_kind_check" CHECK (kind IN ('external','internal')),
	CONSTRAINT "application_one_subject_check" CHECK ((candidate_id IS NOT NULL) <> (worker_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "hiring"."candidate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source" text,
	"contact" jsonb,
	"dob" date,
	"gender" text,
	"cv_storage_key" text,
	"seniority" text,
	"segment" text,
	"source_cost" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hiring"."requisition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"role_title" text,
	"grade" text,
	"account_id" uuid,
	"resource_request_id" uuid,
	"position_id" uuid,
	"kind" text DEFAULT 'new' NOT NULL,
	"approval_status" text DEFAULT 'draft' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"stage" text DEFAULT 'sourcing' NOT NULL,
	"jd" jsonb,
	"owner_user_id" uuid,
	"due_date" date,
	"closed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requisition_kind_check" CHECK (kind IN ('replacement','new')),
	CONSTRAINT "requisition_approval_status_check" CHECK (approval_status IN ('draft','pending_approval','approved','rejected')),
	CONSTRAINT "requisition_status_check" CHECK (status IN ('open','on_hold','filled','cancelled')),
	CONSTRAINT "requisition_stage_check" CHECK (stage IN ('sourcing','screening','interview','offer'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "application_uniq_candidate" ON "hiring"."application" USING btree ("tenant_id","requisition_id","candidate_id") WHERE candidate_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "application_uniq_worker" ON "hiring"."application" USING btree ("tenant_id","requisition_id","worker_id") WHERE worker_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "application_by_requisition" ON "hiring"."application" USING btree ("tenant_id","requisition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requisition_uniq_resource_request" ON "hiring"."requisition" USING btree ("tenant_id","resource_request_id") WHERE resource_request_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "requisition_by_status_stage" ON "hiring"."requisition" USING btree ("tenant_id","status","stage");