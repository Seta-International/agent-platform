CREATE TABLE "pm"."project_approval" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"submitted_by_user_id" uuid,
	"pmo_signed_off_at" timestamp with time zone,
	"pmo_signed_off_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"decided_by_user_id" uuid,
	"rejected_at" timestamp with time zone,
	"rejected_stage" text,
	"rejection_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_approval_rejected_stage_check" CHECK (rejected_stage IN ('pmo', 'bod'))
);
--> statement-breakpoint
ALTER TABLE "pm"."project" RENAME COLUMN "pm_worker_id" TO "pm_person_id";--> statement-breakpoint
ALTER TABLE "pm"."project" RENAME COLUMN "pmo_worker_id" TO "pmo_person_id";--> statement-breakpoint
ALTER TABLE "pm"."project" DROP CONSTRAINT "project_status_check";--> statement-breakpoint
ALTER TABLE "pm"."project" DROP CONSTRAINT "project_charter_id_charter_id_fk";
--> statement-breakpoint
DROP INDEX "pm"."project_by_charter";--> statement-breakpoint
ALTER TABLE "pm"."project_approval" ADD CONSTRAINT "project_approval_project_fk" FOREIGN KEY ("project_id") REFERENCES "pm"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm"."project" DROP COLUMN "charter_id";--> statement-breakpoint
ALTER TABLE "pm"."project" ADD CONSTRAINT "project_status_check" CHECK (status IN ('submitted', 'pmo_approved', 'active', 'on_hold', 'closed', 'rejected', 'withdrawn'));