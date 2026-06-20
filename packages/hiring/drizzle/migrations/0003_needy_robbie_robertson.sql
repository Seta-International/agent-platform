CREATE TABLE "hiring"."candidate_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"application_id" uuid,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"detail" jsonb,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_event_kind_check" CHECK (kind IN ('created','stage_changed','rejected','transferred','rating_changed','note_changed','skills_changed','profile_changed'))
);
--> statement-breakpoint
CREATE TABLE "hiring"."candidate_skill" (
	"tenant_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"skill_name" text NOT NULL,
	"level" integer,
	CONSTRAINT "candidate_skill_candidate_id_skill_id_pk" PRIMARY KEY("candidate_id","skill_id"),
	CONSTRAINT "candidate_skill_level_check" CHECK (level IS NULL OR level BETWEEN 0 AND 5)
);
--> statement-breakpoint
CREATE TABLE "hiring"."rejection_reason" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rejection_reason_category_check" CHECK (category IN ('rejected_by_us','withdrew','other'))
);
--> statement-breakpoint
ALTER TABLE "hiring"."application" ALTER COLUMN "stage" SET DEFAULT 'new';--> statement-breakpoint
ALTER TABLE "hiring"."application" ALTER COLUMN "stage" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "hiring"."application" ALTER COLUMN "status" SET DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "hiring"."application" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "hiring"."application" ADD COLUMN "rejection_reason_id" uuid;--> statement-breakpoint
ALTER TABLE "hiring"."application" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "hiring"."application" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "hiring"."application" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hiring"."application" ADD COLUMN "superseded_by_application_id" uuid;--> statement-breakpoint
ALTER TABLE "hiring"."application" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX "candidate_event_by_candidate" ON "hiring"."candidate_event" USING btree ("tenant_id","candidate_id","created_at");--> statement-breakpoint
CREATE INDEX "candidate_skill_by_skill" ON "hiring"."candidate_skill" USING btree ("tenant_id","skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rejection_reason_uniq_label" ON "hiring"."rejection_reason" USING btree ("tenant_id","label");--> statement-breakpoint
CREATE INDEX "application_by_candidate" ON "hiring"."application" USING btree ("tenant_id","candidate_id");--> statement-breakpoint
ALTER TABLE "hiring"."application" ADD CONSTRAINT "application_stage_check" CHECK (stage IN ('new','screening','interview','offer'));--> statement-breakpoint
ALTER TABLE "hiring"."application" ADD CONSTRAINT "application_status_check" CHECK (status IN ('active','hired','rejected','transferred'));--> statement-breakpoint
ALTER TABLE "hiring"."application" ADD CONSTRAINT "application_rating_check" CHECK (rating IS NULL OR rating BETWEEN 0 AND 5);