import { halfvec } from '@seta/shared-db';
import { desc } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  index,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const knowledge = pgSchema('knowledge');

export const files = knowledge.table(
  'files',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    tenant_id: uuid('tenant_id').notNull(),
    uploaded_by: uuid('uploaded_by').notNull(),
    filename: text('filename').notNull(),
    mime_type: text('mime_type').notNull(),
    size_bytes: bigint('size_bytes', { mode: 'bigint' }).notNull(),
    s3_key: text('s3_key').notNull().unique(),
    status: text('status', {
      enum: ['uploading', 'parsing', 'embedding', 'ready', 'failed'],
    }).notNull(),
    scan_status: text('scan_status', {
      enum: ['pending', 'scanning', 'clean', 'infected', 'error'],
    })
      .notNull()
      .default('pending'),
    scan_at: timestamp('scan_at', { withTimezone: true }),
    scan_detail: text('scan_detail'),
    error_reason: text('error_reason'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    processed_at: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [index('files_by_tenant').on(t.tenant_id, desc(t.created_at))],
);

export const chunks = knowledge.table(
  'chunks',
  {
    tenant_id: uuid('tenant_id').notNull(),
    file_id: bigint('file_id', { mode: 'bigint' }).notNull(),
    chunk_ordinal: integer('chunk_ordinal').notNull(),
    chunk_text: text('chunk_text').notNull(),
    page_hint: text('page_hint'),
  },
  (t) => [primaryKey({ columns: [t.tenant_id, t.file_id, t.chunk_ordinal] })],
);

export const embeddings = knowledge.table(
  'embeddings',
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
