CREATE TABLE "hiring"."jd_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jd_template_kind_check" CHECK (kind IN ('role','intro','closing'))
);
--> statement-breakpoint
CREATE TABLE "hiring"."jd_template_section" (
	"tenant_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"variant" text NOT NULL,
	"section" text NOT NULL,
	"body" text NOT NULL,
	CONSTRAINT "jd_template_section_template_id_variant_section_pk" PRIMARY KEY("template_id","variant","section"),
	CONSTRAINT "jd_template_section_variant_check" CHECK (variant IN ('internal','external')),
	CONSTRAINT "jd_template_section_section_check" CHECK (section IN ('about','responsibilities','requirements','nice_to_have'))
);
--> statement-breakpoint
CREATE TABLE "hiring"."opening" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"requisition_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"close_reason_id" uuid,
	"closed_at" timestamp with time zone,
	"hired_application_id" uuid,
	"resource_request_id" uuid,
	"position_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opening_status_check" CHECK (status IN ('open','filled','closed','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "hiring"."opening_close_reason" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"label" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hiring"."requisition_jd_section" (
	"tenant_id" uuid NOT NULL,
	"requisition_id" uuid NOT NULL,
	"variant" text NOT NULL,
	"section" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requisition_jd_section_requisition_id_variant_section_pk" PRIMARY KEY("requisition_id","variant","section"),
	CONSTRAINT "jd_section_variant_check" CHECK (variant IN ('internal','external')),
	CONSTRAINT "jd_section_section_check" CHECK (section IN ('about','responsibilities','requirements','nice_to_have'))
);
--> statement-breakpoint
CREATE TABLE "hiring"."requisition_skill" (
	"tenant_id" uuid NOT NULL,
	"requisition_id" uuid NOT NULL,
	"skill_id" uuid,
	"skill_name" text NOT NULL,
	"min_level" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requisition_skill_requisition_id_skill_name_pk" PRIMARY KEY("requisition_id","skill_name")
);
--> statement-breakpoint
DROP INDEX "hiring"."requisition_uniq_resource_request";--> statement-breakpoint
ALTER TABLE "hiring"."requisition" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "hiring"."requisition" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "hiring"."requisition" ADD COLUMN "default_interview_mode" text;--> statement-breakpoint
CREATE UNIQUE INDEX "jd_template_uniq_name" ON "hiring"."jd_template" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "opening_uniq_seq" ON "hiring"."opening" USING btree ("tenant_id","requisition_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "opening_uniq_resource_request" ON "hiring"."opening" USING btree ("tenant_id","resource_request_id") WHERE resource_request_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "opening_by_requisition" ON "hiring"."opening" USING btree ("tenant_id","requisition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "close_reason_uniq_label" ON "hiring"."opening_close_reason" USING btree ("tenant_id","label");--> statement-breakpoint
CREATE INDEX "requisition_by_account" ON "hiring"."requisition" USING btree ("tenant_id","account_id");--> statement-breakpoint
ALTER TABLE "hiring"."requisition" DROP COLUMN "resource_request_id";--> statement-breakpoint
ALTER TABLE "hiring"."requisition" DROP COLUMN "position_id";--> statement-breakpoint
ALTER TABLE "hiring"."requisition" DROP COLUMN "jd";--> statement-breakpoint
ALTER TABLE "hiring"."requisition" ADD CONSTRAINT "requisition_interview_mode_check" CHECK (default_interview_mode IS NULL OR default_interview_mode IN ('online','onsite','either'));