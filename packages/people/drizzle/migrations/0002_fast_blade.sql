ALTER TABLE "people"."worker" ADD COLUMN "job_title" text;--> statement-breakpoint
ALTER TABLE "people"."worker" ADD COLUMN "manager_id" uuid;--> statement-breakpoint
ALTER TABLE "people"."worker" ADD CONSTRAINT "worker_manager_fk" FOREIGN KEY ("manager_id") REFERENCES "people"."worker"("person_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "worker_by_manager" ON "people"."worker" USING btree ("tenant_id","manager_id");