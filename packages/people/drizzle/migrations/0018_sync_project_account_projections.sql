-- hand-written: cross-schema backfill of worker_allocation_projection, account_projection, and project_projection from pm schema (FUT-891)
-- Synchronizes all accounts, projects, and allocations into people schema projections so all Resource Allocation and RA Monitoring data match perfectly.
DO $$
BEGIN
  -- 1. Sync accounts into people.account_projection
  IF to_regclass('pm.account') IS NOT NULL AND to_regclass('people.account_projection') IS NOT NULL THEN
    INSERT INTO people.account_projection (
      account_id,
      tenant_id,
      name,
      updated_at
    )
    SELECT
      a.id AS account_id,
      a.tenant_id,
      a.name,
      NOW() AS updated_at
    FROM pm.account a
    ON CONFLICT (account_id) DO UPDATE SET
      name = EXCLUDED.name,
      updated_at = NOW();
  ELSIF to_regclass('pm.accounts') IS NOT NULL AND to_regclass('people.account_projection') IS NOT NULL THEN
    INSERT INTO people.account_projection (
      account_id,
      tenant_id,
      name,
      updated_at
    )
    SELECT
      a.id AS account_id,
      a.tenant_id,
      a.name,
      NOW() AS updated_at
    FROM pm.accounts a
    WHERE a.deleted_at IS NULL
    ON CONFLICT (account_id) DO UPDATE SET
      name = EXCLUDED.name,
      updated_at = NOW();
  END IF;

  -- 2. Sync projects into people.project_projection
  IF to_regclass('pm.project') IS NOT NULL AND to_regclass('people.project_projection') IS NOT NULL THEN
    INSERT INTO people.project_projection (
      project_id,
      tenant_id,
      account_id,
      name,
      updated_at
    )
    SELECT
      p.id AS project_id,
      p.tenant_id,
      p.account_id,
      p.name,
      NOW() AS updated_at
    FROM pm.project p
    WHERE p.deleted_at IS NULL
    ON CONFLICT (project_id) DO UPDATE SET
      account_id = EXCLUDED.account_id,
      name = EXCLUDED.name,
      updated_at = NOW();
  ELSIF to_regclass('pm.projects') IS NOT NULL AND to_regclass('people.project_projection') IS NOT NULL THEN
    INSERT INTO people.project_projection (
      project_id,
      tenant_id,
      account_id,
      name,
      updated_at
    )
    SELECT
      p.id AS project_id,
      p.tenant_id,
      p.account_id,
      p.name,
      NOW() AS updated_at
    FROM pm.projects p
    WHERE p.deleted_at IS NULL
    ON CONFLICT (project_id) DO UPDATE SET
      account_id = EXCLUDED.account_id,
      name = EXCLUDED.name,
      updated_at = NOW();
  END IF;

  -- 3. Sync allocations into people.worker_allocation_projection
  IF to_regclass('pm.allocation') IS NOT NULL AND to_regclass('pm.project') IS NOT NULL AND to_regclass('people.worker_allocation_projection') IS NOT NULL THEN
    INSERT INTO people.worker_allocation_projection (
      allocation_id,
      tenant_id,
      person_id,
      project_id,
      account_id,
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
      a.person_id,
      a.project_id,
      p.account_id,
      a.date_from,
      a.date_to,
      a.planned_pct,
      a.bucket,
      TRUE AS active,
      NOW() AS updated_at
    FROM pm.allocation a
    INNER JOIN pm.project p ON p.id = a.project_id AND p.tenant_id = a.tenant_id
    WHERE a.deleted_at IS NULL
    ON CONFLICT (allocation_id) DO UPDATE SET
      person_id = EXCLUDED.person_id,
      project_id = EXCLUDED.project_id,
      account_id = EXCLUDED.account_id,
      date_from = EXCLUDED.date_from,
      date_to = EXCLUDED.date_to,
      planned_pct = EXCLUDED.planned_pct,
      bucket = EXCLUDED.bucket,
      active = TRUE,
      updated_at = NOW();

    -- Deactivate soft-deleted allocations
    UPDATE people.worker_allocation_projection wap
    SET active = FALSE, updated_at = NOW()
    FROM pm.allocation a
    WHERE wap.allocation_id = a.id
      AND a.deleted_at IS NOT NULL
      AND wap.active = TRUE;
  ELSIF to_regclass('pm.allocations') IS NOT NULL AND to_regclass('pm.projects') IS NOT NULL AND to_regclass('people.worker_allocation_projection') IS NOT NULL THEN
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
      a.planned_pct,
      a.bucket,
      TRUE AS active,
      NOW() AS updated_at
    FROM pm.allocations a
    INNER JOIN pm.projects p ON p.id = a.project_id AND p.tenant_id = a.tenant_id
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

    UPDATE people.worker_allocation_projection wap
    SET active = FALSE, updated_at = NOW()
    FROM pm.allocations a
    WHERE wap.allocation_id = a.id
      AND a.deleted_at IS NOT NULL
      AND wap.active = TRUE;
  END IF;
END $$;
