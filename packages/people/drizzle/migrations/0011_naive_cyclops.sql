-- Generated worker DROP (drizzle db:generate). Renumbered to 0011 so it runs LAST — after
-- 0006/0008 backfills that still read people.worker, and past 0005_last_talkback's prefix.
-- drizzle also emitted a spurious CREATE people.person_history + DROP people.worker_history for
-- the worker_history→person_history rename it cannot model; those were removed because
-- 0010_rename_worker_history_to_person_history.sql renames the table in place (preserving rows).
-- worker's touch trigger, RLS policy, FK, and the three worker_*_trgm indexes cascade-drop here.
DROP TABLE "people"."worker" CASCADE;
