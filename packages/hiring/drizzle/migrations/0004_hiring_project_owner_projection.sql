CREATE TABLE "hiring"."project_owner_projection" (
	"project_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_owner_projection_project_id_worker_id_pk" PRIMARY KEY("project_id","worker_id")
);
--> statement-breakpoint
CREATE INDEX "project_owner_projection_by_worker" ON "hiring"."project_owner_projection" USING btree ("tenant_id","worker_id");