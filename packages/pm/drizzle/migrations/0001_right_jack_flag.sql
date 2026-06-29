ALTER TABLE "pm"."allocation" ALTER COLUMN "planned_pct" SET DATA TYPE numeric(10, 4);--> statement-breakpoint
ALTER TABLE "pm"."project" ALTER COLUMN "budget_bmm" SET DATA TYPE numeric(15, 4);--> statement-breakpoint
ALTER TABLE "pm"."account" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "pm"."allocation" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "pm"."project" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "pm"."project" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "allocation_by_worker" ON "pm"."allocation" USING btree ("tenant_id","worker_id") WHERE worker_id IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
ALTER TABLE "pm"."allocation" ADD CONSTRAINT "allocation_committed_dates_check" CHECK (status = 'placeholder' OR date_from IS NOT NULL);