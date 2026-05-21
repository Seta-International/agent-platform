-- hand-written: drizzle pgTable cannot express PARTITION BY LIST.
-- Per-tenant child partitions and HNSW indexes are created lazily on first embed
-- per (tenant_id) by shared/db's ensureTenantPartition() helper.

CREATE TABLE planner.task_embeddings (
  tenant_id     uuid          NOT NULL,
  task_id       bigint        NOT NULL,
  chunk_ordinal integer       NOT NULL,
  chunk_text    text          NOT NULL,
  source_hash   text          NOT NULL,
  embedding     halfvec(1536) NOT NULL,
  model_id      text          NOT NULL,
  embedded_at   timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, task_id, chunk_ordinal)
) PARTITION BY LIST (tenant_id);
