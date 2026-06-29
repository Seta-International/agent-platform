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
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"project_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "charter_status_check" CHECK (status IN ('submitted','approved','rejected','withdrawn')),
	CONSTRAINT "charter_methodology_check" CHECK (methodology IS NULL OR methodology IN ('scrum','kanban')),
	CONSTRAINT "charter_pricing_check" CHECK (pricing_model IS NULL OR pricing_model IN ('fixed_price','time_materials'))
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
	CONSTRAINT "project_access_level_check" CHECK (level IN ('owner','edit','view'))
);
--> statement-breakpoint
CREATE TABLE "pm"."staffing_plan_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"role" text NOT NULL,
	"effort_mm" numeric(10, 4),
	"skills" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pm"."project" ADD COLUMN "charter_id" uuid;--> statement-breakpoint
ALTER TABLE "pm"."project" ADD COLUMN "pmo_worker_id" uuid;--> statement-breakpoint
ALTER TABLE "pm"."project" ADD COLUMN "team_size" integer;--> statement-breakpoint
ALTER TABLE "pm"."project" ADD COLUMN "methodology" text;--> statement-breakpoint
ALTER TABLE "pm"."project" ADD COLUMN "pricing_model" text;--> statement-breakpoint
ALTER TABLE "pm"."project" ADD COLUMN "date_from" date;--> statement-breakpoint
ALTER TABLE "pm"."project" ADD COLUMN "date_to" date;--> statement-breakpoint
CREATE INDEX "charter_by_account_status" ON "pm"."charter" USING btree ("tenant_id","account_id","status");--> statement-breakpoint
CREATE INDEX "charter_by_tenant" ON "pm"."charter" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_access_uniq" ON "pm"."project_access" USING btree ("tenant_id","project_id","worker_id");--> statement-breakpoint
CREATE INDEX "project_access_by_project" ON "pm"."project_access" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "staffing_plan_line_by_project" ON "pm"."staffing_plan_line" USING btree ("tenant_id","project_id");--> statement-breakpoint
ALTER TABLE "pm"."project" ADD CONSTRAINT "project_methodology_check" CHECK (methodology IS NULL OR methodology IN ('scrum','kanban'));--> statement-breakpoint
ALTER TABLE "pm"."project" ADD CONSTRAINT "project_pricing_check" CHECK (pricing_model IS NULL OR pricing_model IN ('fixed_price','time_materials'));