import { textEnum, textEnumCheck } from '@seta/shared-db';
import { desc, sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const knowledge = pgSchema('knowledge');

export const FILE_STATUS = [
  'uploading',
  'uploaded',
  'consumed',
  'parsing',
  'embedding',
  'ready',
  'failed',
] as const;

export const SCAN_STATUS = ['pending', 'scanning', 'clean', 'infected', 'error'] as const;

export const FILE_ORIGINS = ['knowledge_base', 'chat'] as const;

export const files = knowledge.table(
  'files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    uploaded_by: uuid('uploaded_by').notNull(),
    filename: text('filename').notNull(),
    mime_type: text('mime_type').notNull(),
    size_bytes: bigint('size_bytes', { mode: 'bigint' }).notNull(),
    s3_key: text('s3_key').notNull(),
    status: textEnum('status', FILE_STATUS).notNull(),
    scan_status: textEnum('scan_status', SCAN_STATUS).notNull().default('pending'),
    scan_at: timestamp('scan_at', { withTimezone: true }),
    scan_detail: text('scan_detail'),
    error_reason: text('error_reason'),
    // Chat attachments: thread_id is the owning chat thread (NULL for the
    // tenant knowledge base); origin distinguishes the two upload paths so
    // KB search and thread search never bleed into each other.
    thread_id: uuid('thread_id'),
    origin: textEnum('origin', FILE_ORIGINS).notNull().default('knowledge_base'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    processed_at: timestamp('processed_at', { withTimezone: true }),
    consumed_at: timestamp('consumed_at', { withTimezone: true }),
  },
  (t) => [
    index('files_by_tenant').on(t.tenant_id, desc(t.created_at)),
    index('files_by_thread').on(t.tenant_id, t.thread_id),
    uniqueIndex('files_uniq_s3_key_per_tenant').on(t.tenant_id, t.s3_key),
    uniqueIndex('files_tenant_id_id').on(t.tenant_id, t.id), // FK target for chunks (Task 7)
    check('files_origin_thread_check', sql`(origin = 'chat') = (thread_id IS NOT NULL)`),
    textEnumCheck('files', 'status', FILE_STATUS),
    textEnumCheck('files', 'scan_status', SCAN_STATUS),
    textEnumCheck('files', 'origin', FILE_ORIGINS),
  ],
);

// Model kept for query typing; the actual DDL is hand-written (LIST-partitioned
// by tenant_id) in Task 7's platform SQL — see drizzle.config.ts tablesFilter.
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
