CREATE TABLE "people"."account_projection" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"am_worker_id" uuid
);
--> statement-breakpoint
CREATE TABLE "people"."project_projection" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."worker_allocation_projection" (
	"allocation_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"worker_id" uuid,
	"project_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"account_name" text NOT NULL,
	"lead_worker_id" uuid,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX "project_proj_by_account" ON "people"."project_projection" USING btree ("tenant_id","account_id");--> statement-breakpoint
CREATE INDEX "worker_alloc_by_worker" ON "people"."worker_allocation_projection" USING btree ("tenant_id","worker_id");--> statement-breakpoint
CREATE INDEX "worker_alloc_by_account" ON "people"."worker_allocation_projection" USING btree ("tenant_id","account_id");--> statement-breakpoint
CREATE INDEX "worker_alloc_by_project" ON "people"."worker_allocation_projection" USING btree ("tenant_id","project_id");