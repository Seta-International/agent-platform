-- hand-written: cross-schema backfill; Drizzle cannot express a correlated UPDATE across schemas.
-- cross-schema-read: one-time correlation of identity.user to people.person before
-- people.person.user_id is dropped (DB-2 PR1, spec §4.1).
DO $$
BEGIN
  IF to_regclass('people.person') IS NOT NULL THEN
    UPDATE identity."user" u
    SET person_id = p.id
    FROM people.person p
    WHERE p.user_id = u.id
      AND p.tenant_id = u.tenant_id
      AND u.person_id IS NULL;
  END IF;
END $$;
