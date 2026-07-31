ALTER TABLE "identity"."org_unit_projection" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "identity"."org_unit_projection" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity"."org_unit_projection" ADD CONSTRAINT "org_unit_projection_name_required_unless_deleted" CHECK (deleted_at IS NOT NULL OR name IS NOT NULL);