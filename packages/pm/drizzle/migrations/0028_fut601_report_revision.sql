CREATE TABLE "pm"."report_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"executive_summary" text NOT NULL,
	"risk_issue" text,
	"road_to_green" text,
	"road_to_green_owner_id" uuid,
	"road_to_green_due" date,
	"overall_colour" text NOT NULL,
	"declared_colours" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_revision_overall_colour_check" CHECK (overall_colour IN ('green', 'yellow', 'red', 'gray'))
);
--> statement-breakpoint
ALTER TABLE "pm"."report_revision" ADD CONSTRAINT "report_revision_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "pm"."report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_revision_by_report" ON "pm"."report_revision" USING btree ("tenant_id","report_id","created_at");
--> statement-breakpoint
-- FUT-601 revision model platform SQL: RLS for report_revision and a backfill — drizzle-kit
-- cannot model policies or data backfills.

-- Backfill BEFORE enabling RLS (see 0023 for the rationale): every currently-submitted
-- report gets one revision snapshotted from its live content, so the "last submitted
-- version" view has something to serve from day one.
INSERT INTO pm.report_revision
  (tenant_id, report_id, executive_summary, risk_issue, road_to_green,
   road_to_green_owner_id, road_to_green_due, overall_colour, declared_colours, created_at)
SELECT r.tenant_id, r.id, COALESCE(r.executive_summary, ''), r.risk_issue, r.road_to_green,
       r.road_to_green_owner_id, r.road_to_green_due, COALESCE(r.overall_colour, 'red'),
       r.declared_colours, r.updated_at
FROM pm.report r
WHERE r.status = 'submitted'
ON CONFLICT DO NOTHING;

-- rls backstop (app still writes explicit WHERE tenant_id)
ALTER TABLE pm.report_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.report_revision FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm.report_revision
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
