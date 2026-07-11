ALTER TABLE "pm"."account_recruiter" RENAME COLUMN "recruiter_worker_id" TO "recruiter_person_id";--> statement-breakpoint
DROP INDEX "pm"."account_recruiter_uniq";--> statement-breakpoint
DROP INDEX "pm"."account_recruiter_by_recruiter";--> statement-breakpoint
CREATE UNIQUE INDEX "account_recruiter_uniq" ON "pm"."account_recruiter" USING btree ("tenant_id","account_id","recruiter_person_id");--> statement-breakpoint
CREATE INDEX "account_recruiter_by_recruiter" ON "pm"."account_recruiter" USING btree ("tenant_id","recruiter_person_id");