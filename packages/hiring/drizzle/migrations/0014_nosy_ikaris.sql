ALTER TABLE "hiring"."application" RENAME COLUMN "worker_id" TO "person_id";--> statement-breakpoint
ALTER TABLE "hiring"."application" DROP CONSTRAINT "application_one_subject_check";--> statement-breakpoint
DROP INDEX "hiring"."application_uniq_worker";--> statement-breakpoint
DROP INDEX "hiring"."application_by_worker";--> statement-breakpoint
CREATE UNIQUE INDEX "application_uniq_worker" ON "hiring"."application" USING btree ("tenant_id","requisition_id","person_id") WHERE person_id IS NOT NULL AND status = 'active';--> statement-breakpoint
CREATE INDEX "application_by_worker" ON "hiring"."application" USING btree ("tenant_id","person_id");--> statement-breakpoint
ALTER TABLE "hiring"."application" ADD CONSTRAINT "application_one_subject_check" CHECK ((candidate_id IS NOT NULL) <> (person_id IS NOT NULL));