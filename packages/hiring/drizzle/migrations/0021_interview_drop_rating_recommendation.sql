-- Hand-written: `drizzle-kit generate` still fails for this module with the pre-existing
-- snapshot-chain collision (meta/0009_snapshot.json and meta/0018_snapshot.json both claim
-- meta/0008_snapshot.json as their parent — unrelated to this change, not repaired here).
-- The statements below match exactly what `generate` would emit for dropping the rating /
-- recommendation columns and their checks from hiring.interview in db/schema.ts.
ALTER TABLE "hiring"."interview" DROP CONSTRAINT "interview_recommendation_check";--> statement-breakpoint
ALTER TABLE "hiring"."interview" DROP CONSTRAINT "interview_rating_check";--> statement-breakpoint
ALTER TABLE "hiring"."interview" DROP COLUMN "rating";--> statement-breakpoint
ALTER TABLE "hiring"."interview" DROP COLUMN "recommendation";
