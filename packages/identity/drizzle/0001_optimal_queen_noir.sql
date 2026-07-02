CREATE TABLE "identity"."org_unit_projection" (
	"org_unit_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "org_unit_projection_by_tenant" ON "identity"."org_unit_projection" USING btree ("tenant_id");