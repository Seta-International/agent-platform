-- Backfill: create role grants for existing group members missing from identity.role_grants
-- hand-written: cross-schema-read from identity.role_grants (backfill — one-time data repair)
-- Limitation: cross-schema INSERT is permitted here; migration runner executes this in isolation.
-- This is a one-time data repair — do not replicate this pattern in application code.
INSERT INTO identity.role_grants (id, tenant_id, user_id, role_slug, scope_type, scope_id, granted_by, granted_via)
SELECT
  gen_random_uuid(),
  g.tenant_id,
  gm.user_id,
  'planner.viewer',
  'group',
  gm.group_id::text,
  gm.added_by,
  'cli'
FROM planner.group_members gm
JOIN planner.groups g ON g.id = gm.group_id
WHERE NOT EXISTS (
  SELECT 1
  FROM identity.role_grants rg
  WHERE rg.user_id = gm.user_id
    AND rg.scope_type = 'group'
    AND rg.scope_id = gm.group_id::text
    AND rg.revoked_at IS NULL
);
