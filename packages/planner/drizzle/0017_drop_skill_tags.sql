DROP INDEX IF EXISTS "planner"."tasks_by_skill_tags";--> statement-breakpoint
ALTER TABLE "planner"."tasks" DROP COLUMN IF EXISTS "skill_tags";
