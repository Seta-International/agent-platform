ALTER TABLE "hiring"."candidate" ADD COLUMN "cv_sha256" text;--> statement-breakpoint
CREATE INDEX "candidate_by_cv_sha256" ON "hiring"."candidate" USING btree ("tenant_id","cv_sha256");