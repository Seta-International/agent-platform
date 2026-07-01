ALTER TABLE "people"."person" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "people"."worker" ADD COLUMN "availability_status" text DEFAULT 'available' NOT NULL;--> statement-breakpoint
ALTER TABLE "people"."worker" ADD COLUMN "ooo_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "people"."worker" ADD COLUMN "working_hours" jsonb;--> statement-breakpoint
ALTER TABLE "people"."worker" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;