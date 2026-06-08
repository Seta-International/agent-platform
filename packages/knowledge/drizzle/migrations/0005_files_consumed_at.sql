-- Chat-attachment lifecycle: consumed_at records when a thread file's text was
-- folded into chat history. The status text-column also gains 'uploaded' and
-- 'consumed' values (type-only in Drizzle — no column-type change needed here).

ALTER TABLE knowledge.files
  ADD COLUMN consumed_at timestamp with time zone;
