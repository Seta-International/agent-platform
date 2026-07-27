ALTER TABLE "hiring"."candidate" ADD COLUMN "user_id" uuid;--> statement-breakpoint
CREATE INDEX "candidate_by_user" ON "hiring"."candidate" USING btree ("tenant_id","user_id");