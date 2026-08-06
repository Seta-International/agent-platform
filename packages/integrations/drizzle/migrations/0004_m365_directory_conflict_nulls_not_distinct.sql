-- hand-written: drizzle-orm@0.45.2's uniqueIndex() builder has no .nullsNotDistinct()
-- (only the table-level unique() constraint builder does, and that has no partial-index
-- .where() support), so this can't be expressed in schema.ts and db:generate can't emit it.
-- Postgres defaults to NULLS DISTINCT, so two 'open' conflicts that share
-- (tenant_id, kind, subject_type) but both have a NULL subject_id (unmatched Entra user,
-- no person row yet) or a NULL entra_oid (org-unit conflict, no Entra object) do not collide
-- on m365_directory_conflict_uniq_open — raiseConflict's onConflictDoUpdate never fires and
-- every re-raise inserts a duplicate row instead of bumping last_seen_at. PG17 supports
-- NULLS NOT DISTINCT on unique indexes; rebuild the index with it.
DROP INDEX "integrations"."m365_directory_conflict_uniq_open";--> statement-breakpoint
CREATE UNIQUE INDEX "m365_directory_conflict_uniq_open" ON "integrations"."m365_directory_conflict" USING btree ("tenant_id","kind","subject_type","subject_id","entra_oid") NULLS NOT DISTINCT WHERE status = 'open';
