ALTER TABLE "planner"."group_members" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "planner"."groups" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "planner"."groups" ADD COLUMN "theme" text DEFAULT 'blue' NOT NULL;--> statement-breakpoint
ALTER TABLE "planner"."groups" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "planner"."groups" ADD COLUMN "default_role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "planner"."groups" ADD COLUMN "external_source" text DEFAULT 'native' NOT NULL;--> statement-breakpoint
ALTER TABLE "planner"."groups" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "planner"."groups" ADD COLUMN "external_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "planner"."group_members" ADD CONSTRAINT "group_members_role_check" CHECK (role IN ('owner','member'));--> statement-breakpoint
ALTER TABLE "planner"."groups" ADD CONSTRAINT "groups_theme_check" CHECK (theme IN ('teal','purple','green','blue','pink','orange','red'));--> statement-breakpoint
ALTER TABLE "planner"."groups" ADD CONSTRAINT "groups_visibility_check" CHECK (visibility IN ('private','public'));--> statement-breakpoint
ALTER TABLE "planner"."groups" ADD CONSTRAINT "groups_default_role_check" CHECK (default_role IN ('owner','member'));--> statement-breakpoint
ALTER TABLE "planner"."groups" ADD CONSTRAINT "groups_external_source_check" CHECK (external_source IN ('native','m365'));--> statement-breakpoint
ALTER TABLE "planner"."groups" ADD CONSTRAINT "groups_external_id_required_for_linked" CHECK (external_source = 'native' OR external_id IS NOT NULL);