-- hand-written: drop+recreate, no data to preserve.
-- A1 shipped this table empty as a forward-compat hook. M3.1 supersedes it with
-- identity.user_profile_embeddings (broader source: full profile, not skills only).

DROP TABLE IF EXISTS identity.user_skill_embeddings;
