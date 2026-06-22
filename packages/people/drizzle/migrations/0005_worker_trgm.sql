-- pg_trgm GIN indexes (Drizzle cannot model trigram ops)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS worker_full_name_trgm ON people.worker USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS worker_work_email_trgm ON people.worker USING gin (work_email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS worker_job_title_trgm ON people.worker USING gin (job_title gin_trgm_ops);
