CREATE TABLE "people"."org_unit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"head_worker_id" uuid,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_unit_kind_check" CHECK (kind IN ('executive','operation','function','delivery','pmo'))
);
--> statement-breakpoint
ALTER TABLE "people"."worker" DROP CONSTRAINT "worker_manager_fk";
--> statement-breakpoint
DROP INDEX "people"."worker_by_manager";--> statement-breakpoint
ALTER TABLE "people"."org_unit" ADD CONSTRAINT "org_unit_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "people"."org_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "org_unit_by_parent" ON "people"."org_unit" USING btree ("tenant_id","parent_id");--> statement-breakpoint
CREATE INDEX "org_unit_by_head" ON "people"."org_unit" USING btree ("tenant_id","head_worker_id");--> statement-breakpoint
ALTER TABLE "people"."worker" DROP COLUMN "manager_id";