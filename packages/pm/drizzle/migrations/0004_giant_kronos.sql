ALTER TABLE "pm"."charter" DROP CONSTRAINT "charter_status_check";--> statement-breakpoint
ALTER TABLE "pm"."charter" ADD COLUMN "rejected_stage" text;--> statement-breakpoint
ALTER TABLE "pm"."charter" ADD COLUMN "pmo_signed_off_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "pm"."charter" ADD COLUMN "pmo_signed_off_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pm"."charter" ADD CONSTRAINT "charter_rejected_stage_check" CHECK (rejected_stage IS NULL OR rejected_stage IN ('pmo','bod'));--> statement-breakpoint
ALTER TABLE "pm"."charter" ADD CONSTRAINT "charter_status_check" CHECK (status IN ('submitted','pmo_approved','approved','rejected','withdrawn'));