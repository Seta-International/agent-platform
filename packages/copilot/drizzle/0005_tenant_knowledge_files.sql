-- hand-written: schema add for tenant_knowledge_files

CREATE TABLE copilot.tenant_knowledge_files (
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

CREATE INDEX tenant_knowledge_files_by_tenant
  ON copilot.tenant_knowledge_files (tenant_id, created_at DESC);
