CREATE TABLE "pm"."comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"parent_comment_id" uuid,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pm"."flag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"iso_year" integer NOT NULL,
	"iso_week" integer NOT NULL,
	"report_id" uuid,
	"category" text NOT NULL,
	"computed_colour" text NOT NULL,
	"final_colour" text NOT NULL,
	"latest_audit_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flag_category_check" CHECK (category IN ('quality', 'cost_capacity', 'delivery', 'process')),
	CONSTRAINT "flag_computed_colour_check" CHECK (computed_colour IN ('green', 'yellow', 'red', 'gray')),
	CONSTRAINT "flag_final_colour_check" CHECK (final_colour IN ('green', 'yellow', 'red', 'gray')),
	CONSTRAINT "flag_iso_week_check" CHECK (iso_week BETWEEN 1 AND 53)
);
--> statement-breakpoint
CREATE TABLE "pm"."flag_audit_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"flag_id" uuid NOT NULL,
	"from_colour" text,
	"to_colour" text NOT NULL,
	"reason" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flag_audit_entry_from_colour_check" CHECK (from_colour IN ('green', 'yellow', 'red', 'gray')),
	CONSTRAINT "flag_audit_entry_to_colour_check" CHECK (to_colour IN ('green', 'yellow', 'red', 'gray'))
);
--> statement-breakpoint
CREATE TABLE "pm"."metric_value" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"metric_id" uuid NOT NULL,
	"source_entry_id" uuid,
	"computed_value" numeric(18, 6),
	"colour" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metric_value_colour_check" CHECK (colour IN ('green', 'yellow', 'red', 'gray'))
);
--> statement-breakpoint
CREATE TABLE "pm"."norm_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"metric_id" uuid NOT NULL,
	"metric_version" integer NOT NULL,
	"category" text NOT NULL,
	"green_band" jsonb NOT NULL,
	"yellow_band" jsonb NOT NULL,
	"red_band" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "norm_snapshot_category_check" CHECK (category IN ('quality', 'cost_capacity', 'delivery', 'process'))
);
--> statement-breakpoint
CREATE TABLE "pm"."project_week_rollup" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"iso_year" integer NOT NULL,
	"iso_week" integer NOT NULL,
	"quality_colour" text,
	"cost_capacity_colour" text,
	"delivery_colour" text,
	"process_colour" text,
	"rag" text,
	"ohs" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_week_rollup_quality_colour_check" CHECK (quality_colour IN ('green', 'yellow', 'red', 'gray')),
	CONSTRAINT "project_week_rollup_cost_capacity_colour_check" CHECK (cost_capacity_colour IN ('green', 'yellow', 'red', 'gray')),
	CONSTRAINT "project_week_rollup_delivery_colour_check" CHECK (delivery_colour IN ('green', 'yellow', 'red', 'gray')),
	CONSTRAINT "project_week_rollup_process_colour_check" CHECK (process_colour IN ('green', 'yellow', 'red', 'gray')),
	CONSTRAINT "project_week_rollup_rag_check" CHECK (rag IN ('green', 'yellow', 'red', 'gray')),
	CONSTRAINT "project_week_rollup_iso_week_check" CHECK (iso_week BETWEEN 1 AND 53)
);
--> statement-breakpoint
CREATE TABLE "pm"."report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"iso_year" integer NOT NULL,
	"iso_week" integer NOT NULL,
	"reporter_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"executive_summary" text,
	"overall_colour" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_status_check" CHECK (status IN ('draft', 'submitted')),
	CONSTRAINT "report_overall_colour_check" CHECK (overall_colour IN ('green', 'yellow', 'red', 'gray')),
	CONSTRAINT "report_iso_week_check" CHECK (iso_week BETWEEN 1 AND 53)
);
--> statement-breakpoint
ALTER TABLE "pm"."comment" ADD CONSTRAINT "comment_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "pm"."report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm"."comment" ADD CONSTRAINT "comment_parent_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "pm"."comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm"."flag" ADD CONSTRAINT "flag_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "pm"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm"."flag" ADD CONSTRAINT "flag_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "pm"."report"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm"."flag_audit_entry" ADD CONSTRAINT "flag_audit_entry_flag_id_flag_id_fk" FOREIGN KEY ("flag_id") REFERENCES "pm"."flag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm"."metric_value" ADD CONSTRAINT "metric_value_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "pm"."report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm"."metric_value" ADD CONSTRAINT "metric_value_metric_id_kpi_norm_metric_id_fk" FOREIGN KEY ("metric_id") REFERENCES "pm"."kpi_norm_metric"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm"."metric_value" ADD CONSTRAINT "metric_value_source_entry_id_kpi_record_entry_id_fk" FOREIGN KEY ("source_entry_id") REFERENCES "pm"."kpi_record_entry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm"."norm_snapshot" ADD CONSTRAINT "norm_snapshot_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "pm"."report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm"."norm_snapshot" ADD CONSTRAINT "norm_snapshot_metric_id_kpi_norm_metric_id_fk" FOREIGN KEY ("metric_id") REFERENCES "pm"."kpi_norm_metric"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm"."project_week_rollup" ADD CONSTRAINT "project_week_rollup_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "pm"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm"."report" ADD CONSTRAINT "report_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "pm"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_by_report" ON "pm"."comment" USING btree ("tenant_id","report_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "flag_project_week_category_uniq" ON "pm"."flag" USING btree ("tenant_id","project_id","iso_year","iso_week","category");--> statement-breakpoint
CREATE INDEX "flag_by_report" ON "pm"."flag" USING btree ("tenant_id","report_id");--> statement-breakpoint
CREATE INDEX "flag_audit_entry_by_flag" ON "pm"."flag_audit_entry" USING btree ("tenant_id","flag_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "metric_value_identity_uniq" ON "pm"."metric_value" USING btree ("tenant_id","report_id","metric_id");--> statement-breakpoint
CREATE INDEX "metric_value_by_report" ON "pm"."metric_value" USING btree ("tenant_id","report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "norm_snapshot_report_metric_uniq" ON "pm"."norm_snapshot" USING btree ("tenant_id","report_id","metric_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_week_rollup_uniq" ON "pm"."project_week_rollup" USING btree ("tenant_id","project_id","iso_year","iso_week");--> statement-breakpoint
CREATE UNIQUE INDEX "report_identity_uniq" ON "pm"."report" USING btree ("tenant_id","project_id","iso_year","iso_week","reporter_id");--> statement-breakpoint
CREATE INDEX "report_by_project_week" ON "pm"."report" USING btree ("tenant_id","project_id","iso_year","iso_week");--> statement-breakpoint
CREATE INDEX "report_by_reporter" ON "pm"."report" USING btree ("tenant_id","reporter_id");