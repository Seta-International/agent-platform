-- drizzle cannot model gin_trgm_ops trigram GIN indexes.
-- Post-fold homes for the retired worker directory-search indexes: full_name/work_email
-- moved to people.person, job_title moved to the open people.employment_period.
CREATE INDEX IF NOT EXISTS person_full_name_trgm ON people.person USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS person_work_email_trgm ON people.person USING gin (work_email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS employment_period_job_title_trgm ON people.employment_period USING gin (job_title gin_trgm_ops);
