-- hand-written: drizzle pgTable cannot express PARTITION BY LIST.
-- Replaces the M3.1+M3.2 chunked design with single-row-per-task. chunk_text retains
-- the legacy column name; in this design it holds the FULL source string (one row per
-- task, no chunking). Per-tenant child partitions are created lazily by
-- ensureTenantPartition() on the first embed for each tenant.

DROP TABLE IF EXISTS planner.task_embeddings CASCADE;

CREATE TABLE planner.task_embeddings (
  tenant_id    uuid          NOT NULL,
  task_id      uuid          NOT NULL,
  plan_id      uuid          NOT NULL,
  chunk_text   text          NOT NULL,
  source_hash  text          NOT NULL,
  embedding    halfvec(1536) NOT NULL,
  model_id     text          NOT NULL,
  embedded_at  timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, task_id)
) PARTITION BY LIST (tenant_id);

CREATE INDEX task_embeddings_plan_idx
  ON planner.task_embeddings (tenant_id, plan_id);
