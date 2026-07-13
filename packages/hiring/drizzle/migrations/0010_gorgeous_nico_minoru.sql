CREATE TABLE "hiring"."reason" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"category" text,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reason_kind_check" CHECK (kind IN ('opening_close', 'rejection')),
	CONSTRAINT "reason_category_check" CHECK (category IN ('rejected_by_us', 'withdrew', 'other')),
	CONSTRAINT "reason_category_required_for_rejection" CHECK (kind <> 'rejection' OR category IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX "reason_by_tenant_kind" ON "hiring"."reason" USING btree ("tenant_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "reason_uniq_label" ON "hiring"."reason" USING btree ("tenant_id","kind","label");