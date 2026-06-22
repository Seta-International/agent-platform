ALTER TABLE "people"."worker_allocation_projection" ADD COLUMN "date_from" date;--> statement-breakpoint
ALTER TABLE "people"."worker_allocation_projection" ADD COLUMN "date_to" date;--> statement-breakpoint
ALTER TABLE "people"."worker_allocation_projection" ADD COLUMN "planned_pct" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "people"."worker_allocation_projection" ADD COLUMN "bucket" text;--> statement-breakpoint
ALTER TABLE "people"."worker_allocation_projection" ADD CONSTRAINT "worker_alloc_bucket_check" CHECK (bucket IS NULL OR bucket IN ('billable','internal','bench'));