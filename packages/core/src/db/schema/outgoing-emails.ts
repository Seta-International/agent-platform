import { textEnum, textEnumCheck } from '@seta/shared-db';
import { sql } from 'drizzle-orm';
import { index, integer, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { core } from './_core-schema.ts';

export const OUTGOING_EMAIL_STATUS = ['pending', 'sent', 'permanently_failed'] as const;
export const TRANSPORT_KINDS = [
  'graph',
  'smtp',
  'dev-stub',
  'operator-smtp',
  'operator-dev-stub',
] as const;

export type OutgoingEmailStatus = (typeof OUTGOING_EMAIL_STATUS)[number];
export type TransportKind = (typeof TRANSPORT_KINDS)[number];

export const outgoingEmails = core.table(
  'outgoing_emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    template: text('template').notNull(),
    toAddress: text('to_address').notNull(),
    propsHash: text('props_hash').notNull(),
    transportKind: textEnum('transport_kind', TRANSPORT_KINDS),
    status: textEnum('status', OUTGOING_EMAIL_STATUS).default('pending').notNull(),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
    transportMessageId: text('transport_message_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('outgoing_emails_tenant_dedupe_idx').on(t.tenantId, t.dedupeKey),
    index('outgoing_emails_tenant_created_idx').on(t.tenantId, t.createdAt),
    index('outgoing_emails_pending_idx').on(t.status).where(sql`status = 'pending'`),
    textEnumCheck('outgoing_emails', 'status', OUTGOING_EMAIL_STATUS),
    textEnumCheck('outgoing_emails', 'transport_kind', TRANSPORT_KINDS),
  ],
);
