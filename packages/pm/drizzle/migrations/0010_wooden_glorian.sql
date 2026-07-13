ALTER TABLE "pm"."worker_projection" RENAME TO "person_projection";--> statement-breakpoint
ALTER TABLE "pm"."person_projection" RENAME COLUMN "worker_id" TO "person_id";--> statement-breakpoint
DROP INDEX "pm"."worker_projection_by_name";--> statement-breakpoint
CREATE INDEX "person_projection_by_name" ON "pm"."person_projection" USING btree ("tenant_id","full_name");--> statement-breakpoint
-- platform SQL (not Drizzle-modeled): rename the touch trigger to follow the renamed table
ALTER TRIGGER worker_projection_touch_updated_at ON pm.person_projection RENAME TO person_projection_touch_updated_at;