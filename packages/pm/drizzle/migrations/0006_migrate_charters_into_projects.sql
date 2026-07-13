-- data backfill (charter -> project + project_approval): drizzle cannot model cross-table data moves; hand-written.
-- 1) Charters with NO project (submitted/pmo_approved/rejected/withdrawn): create the project, preserving charter.id,
--    mapping status approved->active (no approved charter is here since those carry a project) else 1:1.
INSERT INTO pm.project (id, tenant_id, account_id, name, objective, scope, budget_bmm, pm_person_id, pmo_person_id,
  team_size, methodology, pricing_model, date_from, date_to, status, phase, version, created_at, updated_at)
SELECT c.id, c.tenant_id, c.account_id, c.name, c.objective, c.scope, c.budget_bmm, c.pm_worker_id, c.pmo_worker_id,
  c.team_size, c.methodology, c.pricing_model, c.date_from, c.date_to,
  CASE c.status WHEN 'approved' THEN 'active' ELSE c.status END, 'initiation', 1, c.created_at, c.updated_at
FROM pm.charter c WHERE c.project_id IS NULL;
--> statement-breakpoint
-- 2) Approved charters that ALREADY have a project: ensure it is active (defensive; it should already be).
UPDATE pm.project p SET status = 'active', updated_at = now()
FROM pm.charter c WHERE c.project_id = p.id AND c.status = 'approved' AND p.status <> 'active';
--> statement-breakpoint
-- 3) A project_approval for EVERY charter, keyed on the resolved project id, copying the 8 governance columns.
INSERT INTO pm.project_approval (project_id, tenant_id, submitted_by_user_id, pmo_signed_off_at,
  pmo_signed_off_by_user_id, approved_at, decided_by_user_id, rejected_at, rejected_stage, rejection_reason,
  version, created_at, updated_at)
SELECT COALESCE(c.project_id, c.id), c.tenant_id, c.submitted_by_user_id, c.pmo_signed_off_at,
  c.pmo_signed_off_by_user_id, c.approved_at, c.decided_by_user_id, c.rejected_at, c.rejected_stage,
  c.rejection_reason, 1, c.created_at, c.updated_at
FROM pm.charter c
ON CONFLICT (project_id) DO NOTHING;
