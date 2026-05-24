import type { EncryptedBlob } from '@seta/shared-crypto';
import { bigint, boolean, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { integrations } from './_integrations-schema.ts';

export type TransportConfigKind = 'graph' | 'smtp';

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

export const mailTransportConfig = integrations.table('mail_transport_config', {
  tenantId: uuid('tenant_id').primaryKey(),
  kind: text('kind').$type<TransportConfigKind>().notNull(),
  senderAddress: text('sender_address').notNull(),
  senderDisplayName: text('sender_display_name'),
  config: jsonb('config').$type<TransportConfigPayload>().notNull(),
  enabled: boolean('enabled').notNull().default(true),
  lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
  lastVerifyError: text('last_verify_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: bigint('created_by', { mode: 'number' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: bigint('updated_by', { mode: 'number' }).notNull(),
});
