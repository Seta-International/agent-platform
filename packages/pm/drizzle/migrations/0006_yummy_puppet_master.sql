CREATE TABLE "pm"."worker_projection" (
	"worker_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"job_title" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "worker_projection_by_name" ON "pm"."worker_projection" USING btree ("tenant_id","full_name");