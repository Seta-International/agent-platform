-- hand-written: one-time cross-schema backfill, per architecture §F.4.2
-- Drizzle's schemaFilter would block this; runs once per tenant at planner schema introduction.
INSERT INTO planner.assignee_projection (user_id, tenant_id, display_name, email, skills, availability_status, timezone, ooo_until, deactivated_at, projection_built_at)
SELECT u.id, u.tenant_id, u.name, u.email,
       COALESCE(p.skills, '{}')::text[],
       COALESCE(p.availability_status, 'available'),
       COALESCE(p.timezone, 'UTC'),
       p.ooo_until,
       u.deactivated_at,
       now()
FROM identity."user" u
LEFT JOIN identity.user_profile p ON p.user_id = u.id
ON CONFLICT (user_id) DO NOTHING;
