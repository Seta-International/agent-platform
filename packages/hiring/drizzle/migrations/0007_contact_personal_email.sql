-- hand-written: Drizzle cannot express a jsonb key rename backfill.
-- Renames candidate.contact->'email' to 'personal_email' (FUT-316 naming: personal vs work email).
UPDATE hiring.candidate
SET contact = (contact - 'email') || jsonb_build_object('personal_email', contact->'email')
WHERE contact ? 'email';
