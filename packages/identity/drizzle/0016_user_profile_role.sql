-- hand-written: drizzle snapshot is stale (only tracks through 0004); follows
-- the same hand-written convention as 0005+ migrations in this folder.
ALTER TABLE "identity"."user_profile"
  ADD COLUMN IF NOT EXISTS "role" text;
