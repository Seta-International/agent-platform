-- hand-written: table rename preserves rows; Drizzle would emit DROP+CREATE (data loss).
-- The RLS policy is named `tenant_isolation` on every people table (buildRlsSql convention),
-- so RENAME TABLE carries it forward as tenant_isolation ON people.person_history already —
-- no ALTER POLICY needed.
ALTER TABLE people.worker_history RENAME TO person_history;
ALTER INDEX people.worker_history_by_person RENAME TO person_history_by_person;
ALTER TABLE people.person_history RENAME CONSTRAINT worker_history_person_fk TO person_history_person_fk;
