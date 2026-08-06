ALTER TABLE "people"."person" ADD COLUMN "photo_storage_key" text;--> statement-breakpoint
ALTER TABLE "people"."person" ADD COLUMN "directory_managed" boolean DEFAULT false NOT NULL;