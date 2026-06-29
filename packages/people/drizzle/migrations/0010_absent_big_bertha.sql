ALTER TABLE "people"."worker" ADD COLUMN "manager_id" uuid;--> statement-breakpoint
CREATE INDEX "worker_by_manager" ON "people"."worker" USING btree ("tenant_id","manager_id");