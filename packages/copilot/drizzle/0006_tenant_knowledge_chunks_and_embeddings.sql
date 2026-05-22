-- hand-written: drizzle pgTable cannot express PARTITION BY LIST or halfvec.
-- Per-tenant child partitions + HNSW provisioned lazily by ensureTenantPartition.

CREATE TABLE copilot.tenant_knowledge_chunks (
  tenant_id     uuid    NOT NULL,
  file_id       bigint  NOT NULL,
  chunk_ordinal integer NOT NULL,
  chunk_text    text    NOT NULL,
  page_hint     text,
  PRIMARY KEY (tenant_id, file_id, chunk_ordinal)
) PARTITION BY LIST (tenant_id);

CREATE TABLE copilot.tenant_knowledge_embeddings (
  tenant_id     uuid          NOT NULL,
  file_id       bigint        NOT NULL,
  chunk_ordinal integer       NOT NULL,
  embedding     halfvec(1536) NOT NULL,
  model_id      text          NOT NULL,
  embedded_at   timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, file_id, chunk_ordinal)
) PARTITION BY LIST (tenant_id);
