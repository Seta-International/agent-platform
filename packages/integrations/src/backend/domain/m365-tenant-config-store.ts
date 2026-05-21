import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { m365TenantConfig } from '../../db/schema/index.ts';

export interface M365TenantConfigRow {
  tenantId: string;
  entraTenantId: string;
  clientId: string;
  clientSecretBlob: import('@seta/shared-crypto').EncryptedBlob;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertM365TenantConfigInput {
  tenantId: string;
  entraTenantId: string;
  clientId: string;
  clientSecretBlob: import('@seta/shared-crypto').EncryptedBlob;
  actorUserId: number;
}

export interface M365TenantConfigStore {
  findEnabled(tenantId: string): Promise<M365TenantConfigRow | null>;
  upsert(input: UpsertM365TenantConfigInput): Promise<void>;
}

export interface CreateM365TenantConfigStoreDeps {
  db: NodePgDatabase<Record<string, unknown>>;
}

export function createM365TenantConfigStore(
  deps: CreateM365TenantConfigStoreDeps,
): M365TenantConfigStore {
  const { db } = deps;
  return {
    async findEnabled(tenantId) {
      const [row] = await db
        .select()
        .from(m365TenantConfig)
        .where(eq(m365TenantConfig.tenantId, tenantId))
        .limit(1);
      if (!row?.enabled) return null;
      return row as M365TenantConfigRow;
    },
    async upsert(input) {
      await db
        .insert(m365TenantConfig)
        .values({
          tenantId: input.tenantId,
          entraTenantId: input.entraTenantId,
          clientId: input.clientId,
          clientSecretBlob: input.clientSecretBlob,
          enabled: true,
          createdBy: input.actorUserId,
          updatedBy: input.actorUserId,
        })
        .onConflictDoUpdate({
          target: m365TenantConfig.tenantId,
          set: {
            entraTenantId: input.entraTenantId,
            clientId: input.clientId,
            clientSecretBlob: input.clientSecretBlob,
            enabled: true,
            updatedAt: sql`now()`,
            updatedBy: input.actorUserId,
          },
        });
    },
  };
}
