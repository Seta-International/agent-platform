CREATE TABLE "people"."performance_config_criterion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"weight" numeric(5, 2) NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "perf_config_criterion_weight_range" CHECK (weight >= 0 AND weight <= 100)
);
--> statement-breakpoint
CREATE TABLE "people"."performance_config_group_weight" (
	"revision_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"weight" numeric(5, 2) NOT NULL,
	CONSTRAINT "performance_config_group_weight_revision_id_group_id_pk" PRIMARY KEY("revision_id","group_id"),
	CONSTRAINT "perf_config_group_weight_range" CHECK (weight >= 0 AND weight <= 100)
);
--> statement-breakpoint
CREATE TABLE "people"."performance_config_month_pin" (
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"review_month" text NOT NULL,
	"revision_id" uuid NOT NULL,
	"pinned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "performance_config_month_pin_tenant_id_account_id_review_month_pk" PRIMARY KEY("tenant_id","account_id","review_month"),
	CONSTRAINT "perf_config_month_pin_ym" CHECK (review_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE TABLE "people"."performance_config_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."performance_evaluation_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "people"."performance_config_criterion" ADD CONSTRAINT "performance_config_criterion_revision_id_performance_config_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "people"."performance_config_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people"."performance_config_criterion" ADD CONSTRAINT "performance_config_criterion_group_id_performance_evaluation_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "people"."performance_evaluation_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people"."performance_config_group_weight" ADD CONSTRAINT "performance_config_group_weight_revision_id_performance_config_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "people"."performance_config_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people"."performance_config_group_weight" ADD CONSTRAINT "performance_config_group_weight_group_id_performance_evaluation_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "people"."performance_evaluation_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people"."performance_config_month_pin" ADD CONSTRAINT "performance_config_month_pin_revision_id_performance_config_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "people"."performance_config_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "perf_config_criterion_uniq_name" ON "people"."performance_config_criterion" USING btree ("revision_id","group_id","name");--> statement-breakpoint
CREATE INDEX "perf_config_criterion_by_rev" ON "people"."performance_config_criterion" USING btree ("revision_id","group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "perf_config_rev_uniq" ON "people"."performance_config_revision" USING btree ("tenant_id","account_id","revision_no");--> statement-breakpoint
CREATE INDEX "perf_config_rev_by_account" ON "people"."performance_config_revision" USING btree ("tenant_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "perf_eval_group_uniq_code" ON "people"."performance_evaluation_group" USING btree ("tenant_id","code");--> statement-breakpoint
-- RLS (hand-written — Drizzle can't model row-level security): tenant isolation
-- for the tenant-scoped performance config tables (FUT-778). Child tables
-- (group_weight/criterion) are revision-scoped and reached only via these.
ALTER TABLE people.performance_evaluation_group ENABLE ROW LEVEL SECURITY;
ALTER TABLE people.performance_evaluation_group FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON people.performance_evaluation_group
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE people.performance_config_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE people.performance_config_revision FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON people.performance_config_revision
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE people.performance_config_month_pin ENABLE ROW LEVEL SECURITY;
ALTER TABLE people.performance_config_month_pin FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON people.performance_config_month_pin
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
