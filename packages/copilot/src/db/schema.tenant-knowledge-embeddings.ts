import { halfvec } from '@seta/shared-db';
import { bigint, integer, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { copilot } from './pg-schema.ts';

export const tenantKnowledgeEmbeddings = copilot.table(
  'tenant_knowledge_embeddings',
  {
    tenant_id: uuid('tenant_id').notNull(),
    file_id: bigint('file_id', { mode: 'bigint' }).notNull(),
    chunk_ordinal: integer('chunk_ordinal').notNull(),
    embedding: halfvec('embedding', { dimensions: 1536 }).notNull(),
    model_id: text('model_id').notNull(),
    embedded_at: timestamp('embedded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenant_id, t.file_id, t.chunk_ordinal] })],
);
