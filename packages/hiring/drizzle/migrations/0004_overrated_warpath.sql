DROP INDEX "hiring"."application_uniq_candidate";--> statement-breakpoint
DROP INDEX "hiring"."application_uniq_worker";--> statement-breakpoint
CREATE UNIQUE INDEX "application_uniq_candidate" ON "hiring"."application" USING btree ("tenant_id","requisition_id","candidate_id") WHERE candidate_id IS NOT NULL AND status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "application_uniq_worker" ON "hiring"."application" USING btree ("tenant_id","requisition_id","worker_id") WHERE worker_id IS NOT NULL AND status = 'active';