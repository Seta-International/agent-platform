-- Chat attachments: thread_id is the owning chat thread (NULL for tenant
-- knowledge-base files); origin distinguishes the two upload paths so KB
-- search and per-thread search never bleed into each other.

ALTER TABLE knowledge.files
  ADD COLUMN thread_id uuid,
  ADD COLUMN origin    text NOT NULL DEFAULT 'knowledge_base'
    CHECK (origin IN ('knowledge_base','chat'));

CREATE INDEX files_by_thread
  ON knowledge.files (tenant_id, thread_id);
