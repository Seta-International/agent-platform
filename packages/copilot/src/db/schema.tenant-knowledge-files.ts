import { desc } from 'drizzle-orm';
import { bigint, bigserial, index, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { copilot } from './pg-schema.ts';

export const tenantKnowledgeFiles = copilot.table(
  'tenant_knowledge_files',
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
    error_reason: text('error_reason'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    processed_at: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [index('tenant_knowledge_files_by_tenant').on(t.tenant_id, desc(t.created_at))],
);
