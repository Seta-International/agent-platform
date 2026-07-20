CREATE TABLE "pm"."kpi_applied_metric" (
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"metric_id" uuid NOT NULL,
	"applied_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_applied_metric_tenant_id_project_id_metric_id_pk" PRIMARY KEY("tenant_id","project_id","metric_id")
);
--> statement-breakpoint
CREATE TABLE "pm"."kpi_norm" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"revision" text NOT NULL,
	"effective_date" date,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pm"."kpi_norm_metric" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"norm_id" uuid NOT NULL,
	"category" text NOT NULL,
	"tier" text NOT NULL,
	"name" text NOT NULL,
	"formula_label" text NOT NULL,
	"component_count" integer NOT NULL,
	"component_1_label" text NOT NULL,
	"component_2_label" text,
	"green_band" jsonb NOT NULL,
	"yellow_band" jsonb NOT NULL,
	"red_band" jsonb NOT NULL,
	"insight" text,
	"is_live_capable" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_norm_metric_category_check" CHECK (category IN ('quality', 'cost_capacity', 'delivery', 'process')),
	CONSTRAINT "kpi_norm_metric_tier_check" CHECK (tier IN ('core', 'extended')),
	CONSTRAINT "kpi_norm_metric_component_count_check" CHECK (component_count IN (1, 2)),
	CONSTRAINT "kpi_norm_metric_component_2_label_check" CHECK (component_count = 1 OR component_2_label IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "pm"."kpi_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"iso_year" integer NOT NULL,
	"iso_week" integer NOT NULL,
	"created_by" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_record_iso_week_check" CHECK (iso_week BETWEEN 1 AND 53)
);
--> statement-breakpoint
CREATE TABLE "pm"."kpi_record_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"metric_id" uuid NOT NULL,
	"component_1_value" numeric(15, 4),
	"component_2_value" numeric(15, 4),
	"computed_value" numeric(15, 4),
	"status" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_record_entry_status_check" CHECK (status IN ('green', 'yellow', 'red')),
	CONSTRAINT "kpi_record_entry_source_check" CHECK (source IN ('manual', 'live'))
);
--> statement-breakpoint
ALTER TABLE "pm"."kpi_applied_metric" ADD CONSTRAINT "kpi_applied_metric_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "pm"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm"."kpi_applied_metric" ADD CONSTRAINT "kpi_applied_metric_metric_id_kpi_norm_metric_id_fk" FOREIGN KEY ("metric_id") REFERENCES "pm"."kpi_norm_metric"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kpi_applied_metric_by_metric" ON "pm"."kpi_applied_metric" USING btree ("tenant_id","metric_id");--> statement-breakpoint
ALTER TABLE "pm"."kpi_norm_metric" ADD CONSTRAINT "kpi_norm_metric_norm_id_kpi_norm_id_fk" FOREIGN KEY ("norm_id") REFERENCES "pm"."kpi_norm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm"."kpi_record" ADD CONSTRAINT "kpi_record_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "pm"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm"."kpi_record_entry" ADD CONSTRAINT "kpi_record_entry_record_id_kpi_record_id_fk" FOREIGN KEY ("record_id") REFERENCES "pm"."kpi_record"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm"."kpi_record_entry" ADD CONSTRAINT "kpi_record_entry_metric_id_kpi_norm_metric_id_fk" FOREIGN KEY ("metric_id") REFERENCES "pm"."kpi_norm_metric"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kpi_norm_uniq_code" ON "pm"."kpi_norm" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "kpi_norm_metric_uniq_name" ON "pm"."kpi_norm_metric" USING btree ("tenant_id","norm_id","name");--> statement-breakpoint
CREATE INDEX "kpi_norm_metric_by_norm" ON "pm"."kpi_norm_metric" USING btree ("tenant_id","norm_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "kpi_record_uniq_week" ON "pm"."kpi_record" USING btree ("tenant_id","project_id","iso_year","iso_week");--> statement-breakpoint
CREATE INDEX "kpi_record_by_project" ON "pm"."kpi_record" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kpi_record_entry_uniq_metric" ON "pm"."kpi_record_entry" USING btree ("tenant_id","record_id","metric_id");--> statement-breakpoint
CREATE INDEX "kpi_record_entry_by_record" ON "pm"."kpi_record_entry" USING btree ("tenant_id","record_id");--> statement-breakpoint
CREATE INDEX "kpi_record_entry_by_metric" ON "pm"."kpi_record_entry" USING btree ("tenant_id","metric_id");
--> statement-breakpoint
-- RLS policy + touch triggers: drizzle-kit cannot model these; generated by generate-platform-sql.ts
CREATE TRIGGER kpi_norm_touch_updated_at
BEFORE UPDATE ON pm.kpi_norm
FOR EACH ROW EXECUTE FUNCTION pm.tg_touch_updated_at();

CREATE TRIGGER kpi_norm_metric_touch_updated_at
BEFORE UPDATE ON pm.kpi_norm_metric
FOR EACH ROW EXECUTE FUNCTION pm.tg_touch_updated_at();

CREATE TRIGGER kpi_record_touch_updated_at
BEFORE UPDATE ON pm.kpi_record
FOR EACH ROW EXECUTE FUNCTION pm.tg_touch_updated_at();

CREATE TRIGGER kpi_record_entry_touch_updated_at
BEFORE UPDATE ON pm.kpi_record_entry
FOR EACH ROW EXECUTE FUNCTION pm.tg_touch_updated_at();

ALTER TABLE pm.kpi_norm ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.kpi_norm FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm.kpi_norm
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE pm.kpi_norm_metric ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.kpi_norm_metric FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm.kpi_norm_metric
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE pm.kpi_applied_metric ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.kpi_applied_metric FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm.kpi_applied_metric
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE pm.kpi_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.kpi_record FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm.kpi_record
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE pm.kpi_record_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.kpi_record_entry FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm.kpi_record_entry
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
