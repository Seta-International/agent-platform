-- hand-written: drizzle pgTable cannot express PARTITION BY LIST.
-- Per-tenant child partitions and HNSW indexes are created lazily on first embed
-- per (tenant_id) by shared/db's ensureTenantPartition() helper.

CREATE TABLE identity.user_profile_embeddings (
  tenant_id   uuid          NOT NULL,
  user_id     uuid          NOT NULL,
  source_hash text          NOT NULL,
  embedding   halfvec(1536) NOT NULL,
  model_id    text          NOT NULL,
  embedded_at timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
) PARTITION BY LIST (tenant_id);
