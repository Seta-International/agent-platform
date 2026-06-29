-- HR data (presence/skills/bio/role) now owned by People; identity drops user_profile.
-- Numbered to sort AFTER the later user_profile ALTERs (0016 role, 0018 bio) — the
-- shared-db runner applies *.sql in lexical filename order on a fresh DB.
-- (drizzle-kit re-emitted CREATE directory_person from a stale snapshot; that table
-- already exists via 0004_0022_directory_person, so only the DROP is kept here.)
DROP TABLE IF EXISTS "identity"."user_profile" CASCADE;