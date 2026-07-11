-- hand-written: column renames preserve data; Drizzle would emit drop+add.
ALTER TABLE pm.account RENAME COLUMN am_worker_id TO am_person_id;
ALTER TABLE pm.project_access RENAME COLUMN worker_id TO person_id;
