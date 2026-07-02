CREATE TABLE "hiring"."account_projection" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hiring"."project_projection" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hiring"."requisition" ADD COLUMN "project_id" uuid;--> statement-breakpoint
CREATE INDEX "project_projection_by_account" ON "hiring"."project_projection" USING btree ("tenant_id","account_id");