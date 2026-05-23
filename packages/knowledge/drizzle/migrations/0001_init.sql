-- hand-written: drizzle pgTable cannot express PARTITION BY LIST or halfvec.
-- Per-tenant child partitions + HNSW provisioned lazily by ensureTenantPartition.

CREATE SCHEMA IF NOT EXISTS knowledge;

CREATE TABLE knowledge.files (
  id            bigserial PRIMARY KEY,
  tenant_id     uuid       NOT NULL,
  uploaded_by   uuid       NOT NULL,
  filename      text       NOT NULL,
  mime_type     text       NOT NULL,
  size_bytes    bigint     NOT NULL,
  s3_key        text       NOT NULL UNIQUE,
  status        text       NOT NULL CHECK (status IN ('uploading','parsing','embedding','ready','failed')),
  error_reason  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz
);

CREATE INDEX files_by_tenant
  ON knowledge.files (tenant_id, created_at DESC);

CREATE TABLE knowledge.chunks (
  tenant_id     uuid    NOT NULL,
  file_id       bigint  NOT NULL,
  chunk_ordinal integer NOT NULL,
  chunk_text    text    NOT NULL,
  page_hint     text,
  PRIMARY KEY (tenant_id, file_id, chunk_ordinal)
) PARTITION BY LIST (tenant_id);

CREATE TABLE knowledge.embeddings (
  tenant_id     uuid          NOT NULL,
  file_id       bigint        NOT NULL,
  chunk_ordinal integer       NOT NULL,
  embedding     halfvec(1536) NOT NULL,
  model_id      text          NOT NULL,
  embedded_at   timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, file_id, chunk_ordinal)
) PARTITION BY LIST (tenant_id);
