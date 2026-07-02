CREATE TABLE "hiring"."worker_user_projection" (
	"worker_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hiring"."account_projection" ADD COLUMN "am_worker_id" uuid;--> statement-breakpoint
CREATE INDEX "worker_user_projection_by_user" ON "hiring"."worker_user_projection" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "account_projection_by_am" ON "hiring"."account_projection" USING btree ("tenant_id","am_worker_id");