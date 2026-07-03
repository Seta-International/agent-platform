CREATE TABLE "hiring"."account_projection" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"am_worker_id" uuid
);
--> statement-breakpoint
CREATE TABLE "hiring"."project_projection" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hiring"."worker_user_projection" (
	"worker_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hiring"."requisition" ADD COLUMN "project_id" uuid;--> statement-breakpoint
CREATE INDEX "account_projection_by_am" ON "hiring"."account_projection" USING btree ("tenant_id","am_worker_id");--> statement-breakpoint
CREATE INDEX "project_projection_by_account" ON "hiring"."project_projection" USING btree ("tenant_id","account_id");--> statement-breakpoint
CREATE INDEX "worker_user_projection_by_user" ON "hiring"."worker_user_projection" USING btree ("tenant_id","user_id");