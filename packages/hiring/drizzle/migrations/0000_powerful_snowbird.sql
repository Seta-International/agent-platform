CREATE SCHEMA "hiring";
--> statement-breakpoint
CREATE TABLE "hiring"."application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"requisition_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"candidate_id" uuid,
	"worker_id" uuid,
	"stage" text DEFAULT 'new' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"rating" integer,
	"rejection_reason_id" uuid,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"closed_at" timestamp with time zone,
	"superseded_by_application_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_kind_check" CHECK (kind IN ('external', 'internal')),
	CONSTRAINT "application_stage_check" CHECK (stage IN ('new', 'screening', 'interview', 'offer')),
	CONSTRAINT "application_status_check" CHECK (status IN ('active', 'hired', 'rejected', 'transferred')),
	CONSTRAINT "application_rating_check" CHECK (rating IS NULL OR rating BETWEEN 0 AND 5),
	CONSTRAINT "application_one_subject_check" CHECK ((candidate_id IS NOT NULL) <> (worker_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "hiring"."candidate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source" text,
	"contact" jsonb,
	"dob" date,
	"gender" text,
	"cv_storage_key" text,
	"seniority" text,
	"segment" text,
	"source_cost" numeric(15, 4),
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_gender_check" CHECK (gender IN ('male', 'female', 'prefer_not_to_say'))
);
--> statement-breakpoint
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
	CONSTRAINT "candidate_event_kind_check" CHECK (kind IN ('created', 'stage_changed', 'rejected', 'transferred', 'rating_changed', 'note_changed', 'skills_changed', 'profile_changed'))
);
--> statement-breakpoint
CREATE TABLE "hiring"."candidate_skill" (
	"tenant_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"skill_name" text NOT NULL,
	"level" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_skill_tenant_id_candidate_id_skill_id_pk" PRIMARY KEY("tenant_id","candidate_id","skill_id"),
	CONSTRAINT "candidate_skill_level_check" CHECK (level IS NULL OR level BETWEEN 0 AND 5)
);
--> statement-breakpoint
CREATE TABLE "hiring"."jd_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jd_template_kind_check" CHECK (kind IN ('role', 'intro', 'closing'))
);
--> statement-breakpoint
CREATE TABLE "hiring"."jd_template_section" (
	"tenant_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"variant" text NOT NULL,
	"section" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jd_template_section_tenant_id_template_id_variant_section_pk" PRIMARY KEY("tenant_id","template_id","variant","section"),
	CONSTRAINT "jd_template_section_variant_check" CHECK (variant IN ('internal', 'external')),
	CONSTRAINT "jd_template_section_section_check" CHECK (section IN ('about', 'responsibilities', 'requirements', 'nice_to_have'))
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
	CONSTRAINT "opening_status_check" CHECK (status IN ('open', 'filled', 'closed', 'cancelled'))
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
CREATE TABLE "hiring"."rejection_reason" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rejection_reason_category_check" CHECK (category IN ('rejected_by_us', 'withdrew', 'other'))
);
--> statement-breakpoint
CREATE TABLE "hiring"."requisition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"role_title" text,
	"grade" text,
	"account_id" uuid,
	"kind" text DEFAULT 'new' NOT NULL,
	"approval_status" text DEFAULT 'draft' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"stage" text DEFAULT 'sourcing' NOT NULL,
	"owner_user_id" uuid,
	"due_date" date,
	"start_date" date,
	"note" text,
	"default_interview_mode" text,
	"closed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requisition_kind_check" CHECK (kind IN ('replacement', 'new')),
	CONSTRAINT "requisition_approval_status_check" CHECK (approval_status IN ('draft', 'pending_approval', 'approved', 'rejected')),
	CONSTRAINT "requisition_status_check" CHECK (status IN ('open', 'on_hold', 'filled', 'cancelled')),
	CONSTRAINT "requisition_stage_check" CHECK (stage IN ('sourcing', 'screening', 'interview', 'offer')),
	CONSTRAINT "requisition_default_interview_mode_check" CHECK (default_interview_mode IN ('online', 'onsite', 'either'))
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
	CONSTRAINT "requisition_jd_section_tenant_id_requisition_id_variant_section_pk" PRIMARY KEY("tenant_id","requisition_id","variant","section"),
	CONSTRAINT "requisition_jd_section_variant_check" CHECK (variant IN ('internal', 'external')),
	CONSTRAINT "requisition_jd_section_section_check" CHECK (section IN ('about', 'responsibilities', 'requirements', 'nice_to_have'))
);
--> statement-breakpoint
CREATE TABLE "hiring"."requisition_skill" (
	"tenant_id" uuid NOT NULL,
	"requisition_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"skill_name" text NOT NULL,
	"min_level" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requisition_skill_tenant_id_requisition_id_skill_id_pk" PRIMARY KEY("tenant_id","requisition_id","skill_id")
);
--> statement-breakpoint
ALTER TABLE "hiring"."application" ADD CONSTRAINT "application_requisition_id_requisition_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "hiring"."requisition"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring"."application" ADD CONSTRAINT "application_candidate_id_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "hiring"."candidate"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring"."application" ADD CONSTRAINT "application_rejection_reason_id_rejection_reason_id_fk" FOREIGN KEY ("rejection_reason_id") REFERENCES "hiring"."rejection_reason"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring"."application" ADD CONSTRAINT "application_superseded_by_fk" FOREIGN KEY ("superseded_by_application_id") REFERENCES "hiring"."application"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring"."candidate_event" ADD CONSTRAINT "candidate_event_candidate_id_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "hiring"."candidate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring"."candidate_event" ADD CONSTRAINT "candidate_event_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "hiring"."application"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring"."candidate_skill" ADD CONSTRAINT "candidate_skill_candidate_id_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "hiring"."candidate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring"."jd_template_section" ADD CONSTRAINT "jd_template_section_template_id_jd_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "hiring"."jd_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring"."opening" ADD CONSTRAINT "opening_requisition_id_requisition_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "hiring"."requisition"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring"."opening" ADD CONSTRAINT "opening_close_reason_id_opening_close_reason_id_fk" FOREIGN KEY ("close_reason_id") REFERENCES "hiring"."opening_close_reason"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring"."opening" ADD CONSTRAINT "opening_hired_application_id_application_id_fk" FOREIGN KEY ("hired_application_id") REFERENCES "hiring"."application"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring"."requisition_jd_section" ADD CONSTRAINT "requisition_jd_section_requisition_id_requisition_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "hiring"."requisition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring"."requisition_skill" ADD CONSTRAINT "requisition_skill_requisition_id_requisition_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "hiring"."requisition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_uniq_candidate" ON "hiring"."application" USING btree ("tenant_id","requisition_id","candidate_id") WHERE candidate_id IS NOT NULL AND status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "application_uniq_worker" ON "hiring"."application" USING btree ("tenant_id","requisition_id","worker_id") WHERE worker_id IS NOT NULL AND status = 'active';--> statement-breakpoint
CREATE INDEX "application_by_requisition" ON "hiring"."application" USING btree ("tenant_id","requisition_id");--> statement-breakpoint
CREATE INDEX "application_by_candidate" ON "hiring"."application" USING btree ("tenant_id","candidate_id");--> statement-breakpoint
CREATE INDEX "application_by_worker" ON "hiring"."application" USING btree ("tenant_id","worker_id");--> statement-breakpoint
CREATE INDEX "candidate_by_tenant" ON "hiring"."candidate" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "candidate_event_by_candidate" ON "hiring"."candidate_event" USING btree ("tenant_id","candidate_id","created_at");--> statement-breakpoint
CREATE INDEX "candidate_event_by_application" ON "hiring"."candidate_event" USING btree ("tenant_id","application_id");--> statement-breakpoint
CREATE INDEX "candidate_skill_by_skill" ON "hiring"."candidate_skill" USING btree ("tenant_id","skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jd_template_uniq_name" ON "hiring"."jd_template" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "opening_uniq_seq" ON "hiring"."opening" USING btree ("tenant_id","requisition_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "opening_uniq_resource_request" ON "hiring"."opening" USING btree ("tenant_id","resource_request_id") WHERE resource_request_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "opening_by_requisition" ON "hiring"."opening" USING btree ("tenant_id","requisition_id");--> statement-breakpoint
CREATE INDEX "opening_by_hired_application" ON "hiring"."opening" USING btree ("tenant_id","hired_application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "close_reason_uniq_label" ON "hiring"."opening_close_reason" USING btree ("tenant_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX "rejection_reason_uniq_label" ON "hiring"."rejection_reason" USING btree ("tenant_id","label");--> statement-breakpoint
CREATE INDEX "requisition_by_status_stage" ON "hiring"."requisition" USING btree ("tenant_id","status","stage");--> statement-breakpoint
CREATE INDEX "requisition_by_account" ON "hiring"."requisition" USING btree ("tenant_id","account_id");--> statement-breakpoint
CREATE INDEX "requisition_skill_by_skill" ON "hiring"."requisition_skill" USING btree ("tenant_id","skill_id");