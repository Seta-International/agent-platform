import type { EncryptedBlob } from '@seta/shared-crypto';
import { textEnum, textEnumCheck } from '@seta/shared-db';
import { boolean, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { integrations } from './_integrations-schema.ts';

export const TRANSPORT_KINDS = ['graph', 'smtp'] as const;

export type TransportConfigKind = (typeof TRANSPORT_KINDS)[number];

export interface GraphTransportConfig {
  app_access_policy_documented: boolean;
}

export interface SmtpTransportConfigEncrypted {
  host: string;
  port: number;
  username: string;
  password_blob: EncryptedBlob;
  require_tls: boolean;
}

export type TransportConfigPayload = GraphTransportConfig | SmtpTransportConfigEncrypted;

export const mailTransportConfig = integrations.table(
  'mail_transport_config',
  {
    tenantId: uuid('tenant_id').primaryKey(),
    kind: textEnum('kind', TRANSPORT_KINDS).notNull(),
    senderAddress: text('sender_address').notNull(),
    senderDisplayName: text('sender_display_name'),
    config: jsonb('config').$type<TransportConfigPayload>().notNull(),
    enabled: boolean('enabled').notNull().default(true),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    lastVerifyError: text('last_verify_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by').notNull(),
  },
  () => [textEnumCheck('mail_transport_config', 'kind', TRANSPORT_KINDS)],
);
