ALTER TABLE "people"."worker_allocation_projection" RENAME COLUMN "worker_id" TO "person_id";--> statement-breakpoint
ALTER TABLE "people"."worker_allocation_projection" RENAME COLUMN "lead_worker_id" TO "lead_person_id";--> statement-breakpoint
DROP INDEX "people"."worker_alloc_by_worker";--> statement-breakpoint
CREATE INDEX "worker_alloc_by_person" ON "people"."worker_allocation_projection" USING btree ("tenant_id","person_id");--> statement-breakpoint
ALTER TABLE "people"."worker_allocation_projection" DROP COLUMN "account_name";