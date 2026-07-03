import { integer, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { knowledge } from './schema.ts';

// Model kept for query typing only. The real DDL is hand-written in
// 0001_knowledge_platform.sql: knowledge.chunks is LIST-partitioned by tenant_id with a
// composite FK to files (tenant_id, id) — neither is expressible in drizzle pgTable. This
// file is deliberately omitted from drizzle.config.ts `schema` so drizzle-kit does not
// emit a plain (non-partitioned) chunks table into the generated baseline (tablesFilter
// does not apply to `generate`).
export const chunks = knowledge.table(
  'chunks',
  {
    tenant_id: uuid('tenant_id').notNull(),
    file_id: uuid('file_id').notNull(),
    chunk_ordinal: integer('chunk_ordinal').notNull(),
    chunk_text: text('chunk_text').notNull(),
    // Non-numeric hints ("p.3", sheet names) — see parse/parsers/*.ts producers.
    page_hint: text('page_hint'),
  },
  (t) => [primaryKey({ columns: [t.tenant_id, t.file_id, t.chunk_ordinal] })],
);
