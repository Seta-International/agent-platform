-- hand-written: pre-backfill integrity guard; Drizzle cannot express a conditional RAISE.
-- cross-schema-read: aborts if any (tenant_id, user_id) in people.person is non-unique,
-- which would make 0004's correlated UPDATE stamp an arbitrary person onto a user
-- (people.person.user_id has no unique index or FK). MUST run before 0004_backfill_*.
-- The filename sorts between 0003_clammy_yellowjacket and 0004 so the runner applies it first.
DO $$
DECLARE
  dup_count int;
  dup_sample text;
BEGIN
  IF to_regclass('people.person') IS NOT NULL THEN
    SELECT count(*) INTO dup_count
    FROM (
      SELECT 1
      FROM people.person
      WHERE user_id IS NOT NULL
      GROUP BY tenant_id, user_id
      HAVING count(*) > 1
    ) d;

    IF dup_count > 0 THEN
      SELECT string_agg(grp, ', ') INTO dup_sample
      FROM (
        SELECT format('(%s, %s)', tenant_id, user_id) AS grp
        FROM people.person
        WHERE user_id IS NOT NULL
        GROUP BY tenant_id, user_id
        HAVING count(*) > 1
        LIMIT 20
      ) s;

      RAISE EXCEPTION
        'user.person_id backfill aborted: % (tenant_id, user_id) group(s) in people.person share a user_id; the backfill would stamp an arbitrary person onto the matching user and Task 6 then drops people.person.user_id, making the mis-link unrecoverable. Resolve the duplicates first. Offending groups (up to 20): %',
        dup_count, dup_sample;
    END IF;
  END IF;
END $$;
