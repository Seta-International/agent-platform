ALTER TABLE "people"."worker" ADD COLUMN "org_unit_id" uuid;--> statement-breakpoint
CREATE INDEX "worker_by_org_unit" ON "people"."worker" USING btree ("tenant_id","org_unit_id");