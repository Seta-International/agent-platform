-- hand-written: cross-schema backfill; Drizzle cannot express an INSERT ... SELECT across schemas.
-- cross-schema-read: one-time population of people.user_projection from identity.user, which
-- holds the canonical person<->user link after DB-2 PR1 Task 5 (spec §4.1). Migrations run
-- identity before people, so identity.user.person_id is already backfilled when this runs.
INSERT INTO people.user_projection (user_id, tenant_id, person_id, deactivated_at)
SELECT u.id, u.tenant_id, u.person_id, u.deactivated_at
FROM identity."user" u
WHERE u.person_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;
