ALTER TABLE "pm"."account" RENAME COLUMN "am_worker_id" TO "am_person_id";--> statement-breakpoint
ALTER TABLE "pm"."project_access" RENAME COLUMN "worker_id" TO "person_id";--> statement-breakpoint
DROP INDEX "pm"."project_access_uniq";--> statement-breakpoint
CREATE UNIQUE INDEX "project_access_uniq" ON "pm"."project_access" USING btree ("tenant_id","project_id","person_id");