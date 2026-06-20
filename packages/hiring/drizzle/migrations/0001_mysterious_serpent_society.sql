DROP INDEX "hiring"."application_uniq_candidate";--> statement-breakpoint
DROP INDEX "hiring"."application_uniq_worker";--> statement-breakpoint
ALTER TABLE "hiring"."candidate" ALTER COLUMN "source_cost" SET DATA TYPE numeric(15, 4);--> statement-breakpoint
ALTER TABLE "hiring"."application" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "hiring"."application" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hiring"."candidate" ADD COLUMN "work_email" text;--> statement-breakpoint
ALTER TABLE "hiring"."candidate" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "hiring"."candidate" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_uniq_email" ON "hiring"."candidate" USING btree ("tenant_id","work_email") WHERE work_email IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "application_uniq_candidate" ON "hiring"."application" USING btree ("tenant_id","requisition_id","candidate_id") WHERE candidate_id IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "application_uniq_worker" ON "hiring"."application" USING btree ("tenant_id","requisition_id","worker_id") WHERE worker_id IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
ALTER TABLE "hiring"."application" ADD CONSTRAINT "application_stage_check" CHECK (stage IS NULL OR stage IN ('new','screening','interview','offer','hired','rejected'));--> statement-breakpoint
ALTER TABLE "hiring"."requisition" ADD CONSTRAINT "requisition_dates_check" CHECK (closed_at IS NULL OR due_date IS NULL OR due_date <= closed_at::date);