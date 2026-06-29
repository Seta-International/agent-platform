CREATE TABLE "identity"."directory_person" (
	"person_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"work_email" text,
	"job_title" text,
	"employment_status" text DEFAULT 'active' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "directory_person_by_tenant" ON "identity"."directory_person" USING btree ("tenant_id");