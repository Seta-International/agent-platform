-- hand-written: drop relocated knowledge tables (moved to @seta/knowledge schema).
-- CASCADE drops the per-tenant LIST child partitions provisioned at runtime.

DROP TABLE IF EXISTS copilot.tenant_knowledge_embeddings CASCADE;
DROP TABLE IF EXISTS copilot.tenant_knowledge_chunks CASCADE;
DROP TABLE IF EXISTS copilot.tenant_knowledge_files CASCADE;
