ALTER TABLE "pm"."allocation" RENAME COLUMN "worker_id" TO "person_id";--> statement-breakpoint
ALTER TABLE "pm"."allocation" DROP CONSTRAINT "allocation_worker_rule_check";--> statement-breakpoint
DROP INDEX "pm"."allocation_by_worker";--> statement-breakpoint
DROP INDEX "pm"."allocation_open_demand";--> statement-breakpoint
DROP INDEX "pm"."allocation_one_placeholder_per_request";--> statement-breakpoint
CREATE INDEX "allocation_by_worker" ON "pm"."allocation" USING btree ("tenant_id","person_id") WHERE person_id IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "allocation_open_demand" ON "pm"."allocation" USING btree ("tenant_id","status") WHERE person_id IS NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "allocation_one_placeholder_per_request" ON "pm"."allocation" USING btree ("tenant_id","resource_request_id") WHERE resource_request_id IS NOT NULL AND person_id IS NULL;--> statement-breakpoint
ALTER TABLE "pm"."allocation" ADD CONSTRAINT "allocation_worker_rule_check" CHECK ((status = 'placeholder' AND person_id IS NULL) OR (status IN ('tentative','committed') AND person_id IS NOT NULL));