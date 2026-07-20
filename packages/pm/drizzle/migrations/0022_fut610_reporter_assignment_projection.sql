CREATE TABLE "pm"."projection_applied_event" (
	"subscription" text NOT NULL,
	"event_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projection_applied_event_subscription_event_id_pk" PRIMARY KEY("subscription","event_id")
);
--> statement-breakpoint
CREATE TABLE "pm"."reporter_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"source_event_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reporter_assignment_uniq_open" ON "pm"."reporter_assignment" USING btree ("tenant_id","project_id","person_id") WHERE valid_to IS NULL;--> statement-breakpoint
CREATE INDEX "reporter_assignment_by_project" ON "pm"."reporter_assignment" USING btree ("tenant_id","project_id","valid_from");
--> statement-breakpoint
-- FUT-610 platform SQL: backfill of the temporal reporter_assignment projection, RLS for the
-- projection tables, and the Admin-catalog immutability guard — drizzle-kit cannot model
-- data backfills, policies, or triggers.

-- Backfill BEFORE enabling RLS on the new table: every current project_access owner becomes
-- an open assignment row, valid from the grant's creation. project_access is FORCE-RLS, so
-- this reads rows only when the migration role bypasses RLS (dev/UAT run as the superuser);
-- elsewhere it inserts nothing and the read port falls back to live project_access for
-- projects the projection has never seen — history before this migration is unknowable
-- either way (project_access keeps no trail).
INSERT INTO pm.reporter_assignment (tenant_id, project_id, person_id, valid_from, source_event_id)
SELECT pa.tenant_id, pa.project_id, pa.person_id, pa.created_at,
       '00000000-0000-0000-0000-000000000000'
FROM pm.project_access pa
WHERE pa.level = 'owner'
ON CONFLICT DO NOTHING;

-- rls backstop (app still writes explicit WHERE tenant_id)
ALTER TABLE pm.reporter_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.reporter_assignment FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm.reporter_assignment
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE pm.projection_applied_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.projection_applied_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm.projection_applied_event
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Admin-catalog immutability (FUT-610 AC1): a published kpi_norm_metric version that any KPI
-- record or report snapshot references may not change its definition in place or be deleted —
-- publish a new version (bump "version") instead. Labels/insight/sort_order stay editable.
CREATE OR REPLACE FUNCTION pm.tg_kpi_norm_metric_immutable() RETURNS trigger AS $$
DECLARE
  referenced boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT EXISTS (
      SELECT 1 FROM pm.kpi_record_entry e WHERE e.metric_id = OLD.id
      UNION ALL
      SELECT 1 FROM pm.norm_snapshot s WHERE s.metric_id = OLD.id
    ) INTO referenced;
    IF referenced THEN
      RAISE EXCEPTION 'kpi_norm_metric % is referenced by KPI records/snapshots and cannot be deleted', OLD.id;
    END IF;
    RETURN OLD;
  END IF;
  IF (NEW.green_band, NEW.yellow_band, NEW.red_band, NEW.formula_label, NEW.component_count, NEW.category)
     IS DISTINCT FROM
     (OLD.green_band, OLD.yellow_band, OLD.red_band, OLD.formula_label, OLD.component_count, OLD.category)
     AND NEW.version IS NOT DISTINCT FROM OLD.version THEN
    SELECT EXISTS (
      SELECT 1 FROM pm.kpi_record_entry e WHERE e.metric_id = OLD.id
      UNION ALL
      SELECT 1 FROM pm.norm_snapshot s WHERE s.metric_id = OLD.id
    ) INTO referenced;
    IF referenced THEN
      RAISE EXCEPTION 'kpi_norm_metric % v% is published and referenced — bump version instead of mutating the definition', OLD.id, OLD.version;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER kpi_norm_metric_immutable
BEFORE UPDATE OR DELETE ON pm.kpi_norm_metric
FOR EACH ROW EXECUTE FUNCTION pm.tg_kpi_norm_metric_immutable();
