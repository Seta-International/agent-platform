-- hand-written: cross-schema backfill of worker_allocation_projection from pm.allocations (FUT-739)
-- Syncs historical allocation dates into people.worker_allocation_projection so stale UAT/Prod records
-- match PM allocations configured dates.
DO $$
BEGIN
  IF to_regclass('pm.allocations') IS NOT NULL THEN
    INSERT INTO people.worker_allocation_projection (
      allocation_id,
      tenant_id,
      person_id,
      project_id,
      account_id,
      lead_person_id,
      date_from,
      date_to,
      planned_pct,
      bucket,
      active,
      updated_at
    )
    SELECT
      a.id AS allocation_id,
      a.tenant_id,
      a.worker_id AS person_id,
      a.project_id,
      p.account_id,
      a.lead_worker_id AS lead_person_id,
      a.date_from,
      a.date_to,
      a.planned_pct::text,
      a.bucket,
      TRUE AS active,
      NOW() AS updated_at
    FROM pm.allocations a
    LEFT JOIN pm.projects p ON p.id = a.project_id AND p.tenant_id = a.tenant_id
    WHERE a.deleted_at IS NULL
    ON CONFLICT (allocation_id) DO UPDATE SET
      person_id = EXCLUDED.person_id,
      project_id = EXCLUDED.project_id,
      account_id = EXCLUDED.account_id,
      lead_person_id = EXCLUDED.lead_person_id,
      date_from = EXCLUDED.date_from,
      date_to = EXCLUDED.date_to,
      planned_pct = EXCLUDED.planned_pct,
      bucket = EXCLUDED.bucket,
      active = TRUE,
      updated_at = NOW();
  END IF;
END $$;

