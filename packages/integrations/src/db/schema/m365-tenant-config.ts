import type { EncryptedBlob } from '@seta/shared-crypto';
import { bigint, boolean, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { integrations } from './_integrations-schema.ts';

export const m365TenantConfig = integrations.table('m365_tenant_config', {
  tenantId: uuid('tenant_id').primaryKey(),
  entraTenantId: uuid('entra_tenant_id').notNull(),
  clientId: text('client_id').notNull(),
  clientSecretBlob: jsonb('client_secret_blob').$type<EncryptedBlob>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: bigint('created_by', { mode: 'number' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: bigint('updated_by', { mode: 'number' }).notNull(),
  enabled: boolean('enabled').notNull().default(true),
});
