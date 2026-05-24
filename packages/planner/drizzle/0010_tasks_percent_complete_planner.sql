-- hand-written: drizzle-kit prompts for column conflicts in a non-TTY environment due to snapshot drift from prior hand-written migrations, and the existing-row snap (legacy 0..100 -> {0,50,100}) cannot be expressed in the Drizzle schema DSL.
-- Snap any existing in-range values to the Microsoft Planner triplet BEFORE swapping the CHECK so the new constraint can adopt without violations.
UPDATE "planner"."tasks"
SET "percent_complete" = CASE
  WHEN "percent_complete" = 0 THEN 0
  WHEN "percent_complete" BETWEEN 1 AND 24 THEN 0
  WHEN "percent_complete" BETWEEN 25 AND 74 THEN 50
  WHEN "percent_complete" BETWEEN 75 AND 100 THEN 100
END
WHERE "percent_complete" NOT IN (0, 50, 100);--> statement-breakpoint
ALTER TABLE "planner"."tasks" DROP CONSTRAINT "tasks_percent_complete_range";--> statement-breakpoint
ALTER TABLE "planner"."tasks" ADD CONSTRAINT "tasks_percent_complete_planner" CHECK (percent_complete IN (0, 50, 100));
