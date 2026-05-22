import { bigint, integer, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { copilot } from './pg-schema.ts';

export const tenantKnowledgeChunks = copilot.table(
  'tenant_knowledge_chunks',
  {
    tenant_id: uuid('tenant_id').notNull(),
    file_id: bigint('file_id', { mode: 'bigint' }).notNull(),
    chunk_ordinal: integer('chunk_ordinal').notNull(),
    chunk_text: text('chunk_text').notNull(),
    page_hint: text('page_hint'),
  },
  (t) => [primaryKey({ columns: [t.tenant_id, t.file_id, t.chunk_ordinal] })],
);
