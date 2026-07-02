ALTER TABLE "pm"."project" ADD COLUMN "org_unit_id" uuid;--> statement-breakpoint
CREATE INDEX "project_by_org_unit" ON "pm"."project" USING btree ("tenant_id","org_unit_id");