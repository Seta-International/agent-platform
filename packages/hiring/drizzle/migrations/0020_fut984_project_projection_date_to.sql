-- Hand-written: `drizzle-kit generate` still fails for this module with the pre-existing
-- snapshot-chain collision described in 0019_interview_lifecycle.sql (meta/0009_snapshot.json
-- and meta/0018_snapshot.json both claim meta/0008_snapshot.json as their parent — unrelated to
-- this change, not repaired here). The statement below matches exactly what `generate` would
-- emit for the new date_to column on project_projection in db/schema.ts (FUT-984).
ALTER TABLE "hiring"."project_projection" ADD COLUMN "date_to" date;
