-- hand-written: drops the planner-owned task_embeddings table. The replacement
-- table is created and owned by Mastra's PgVector via createIndex() at first
-- write/read against schema 'planner_rag' (table name 'task_embeddings'). The
-- schema and its objects are not in Drizzle's schemaFilter, so they live
-- entirely outside the planner module's Drizzle codegen.
--
-- Drizzle cannot model this because:
--   1. The table is created at runtime by an external library (PgVector) using
--      its own DDL conventions (vector_id UUID PK + embedding + metadata JSONB).
--   2. Index creation order is gated by pgvector capability probing (halfvec
--      support detection) inside PgVector.createIndex().
--
-- Migration 0010 (and earlier 0005..0008) created planner.task_embeddings as a
-- list-partitioned table with HNSW indexes per tenant. This is replaced wholesale
-- — no dual-write, no backfill from the old shape. Any pre-existing rows are
-- discarded (re-embedding happens via the normal CDC pipeline when tasks change).

DROP TABLE IF EXISTS planner.task_embeddings CASCADE;
