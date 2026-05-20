import { sql } from 'drizzle-orm';
import { index, integer, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { core } from './_core-schema.ts';

export type OutgoingEmailStatus = 'pending' | 'sent' | 'permanently_failed';
export type TransportKind = 'graph' | 'smtp' | 'dev-stub' | 'operator-smtp' | 'operator-dev-stub';

export const outgoingEmails = core.table(
  'outgoing_emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    template: text('template').notNull(),
    toAddress: text('to_address').notNull(),
    propsHash: text('props_hash').notNull(),
    transportKind: text('transport_kind').$type<TransportKind>(),
    status: text('status').$type<OutgoingEmailStatus>().notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
    transportMessageId: text('transport_message_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => ({
    dedupePerTenant: uniqueIndex('outgoing_emails_tenant_dedupe_idx').on(t.tenantId, t.dedupeKey),
    tenantCreatedIdx: index('outgoing_emails_tenant_created_idx').on(t.tenantId, t.createdAt),
    statusPendingIdx: index('outgoing_emails_pending_idx')
      .on(t.status)
      .where(sql`status = 'pending'`),
  }),
);
