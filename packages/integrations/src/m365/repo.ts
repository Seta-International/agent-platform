import { and, eq, isNull, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema/index.ts';
import { m365GroupLinks } from '../db/schema/index.ts';

export type Link = typeof m365GroupLinks.$inferSelect;
export type SyncStatus = 'idle' | 'pulling' | 'pushing' | 'error' | 'conflict';

export interface UpsertLinkInput {
  tenantId: string;
  groupId: string;
  externalId: string;
  lastSyncedFields: unknown;
  deltaLink?: string | null;
}

export interface CreateM365GroupLinkRepoDeps {
  db: NodePgDatabase<typeof schema>;
}

export interface M365GroupLinkRepo {
  findByGroup(group_id: string): Promise<Link | null>;
  findByExternal(tenant_id: string, external_id: string): Promise<Link | null>;
  upsert(input: UpsertLinkInput): Promise<Link>;
  setSyncStatus(id: string, status: SyncStatus, last_error?: string | null): Promise<void>;
  persistDeltaLink(id: string, delta_link: string, last_synced_fields: unknown): Promise<void>;
  tombstone(id: string): Promise<void>;
}

export function createM365GroupLinkRepo(deps: CreateM365GroupLinkRepoDeps): M365GroupLinkRepo {
  const { db } = deps;

  return {
    async findByGroup(group_id) {
      const [row] = await db
        .select()
        .from(m365GroupLinks)
        .where(and(eq(m365GroupLinks.groupId, group_id), isNull(m365GroupLinks.unlinkedAt)))
        .limit(1);
      return row ?? null;
    },

    async findByExternal(tenant_id, external_id) {
      const [row] = await db
        .select()
        .from(m365GroupLinks)
        .where(
          and(
            eq(m365GroupLinks.tenantId, tenant_id),
            eq(m365GroupLinks.externalId, external_id),
            isNull(m365GroupLinks.unlinkedAt),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async upsert(input) {
      // onConflictDoUpdate with targetWhere to match the partial unique index
      // (tenant_id, group_id) WHERE unlinked_at IS NULL
      const [row] = await db
        .insert(m365GroupLinks)
        .values({
          tenantId: input.tenantId,
          groupId: input.groupId,
          externalId: input.externalId,
          lastSyncedFields: input.lastSyncedFields,
          deltaLink: input.deltaLink ?? null,
          syncStatus: 'idle',
        })
        .onConflictDoUpdate({
          target: [m365GroupLinks.tenantId, m365GroupLinks.groupId],
          targetWhere: sql`unlinked_at IS NULL`,
          set: {
            externalId: input.externalId,
            lastSyncedFields: input.lastSyncedFields,
            deltaLink: input.deltaLink ?? null,
            updatedAt: new Date(),
          },
        })
        .returning();
      return row as Link;
    },

    async setSyncStatus(id, status, last_error = null) {
      await db
        .update(m365GroupLinks)
        .set({
          syncStatus: status,
          lastError: last_error,
          updatedAt: new Date(),
        })
        .where(eq(m365GroupLinks.id, id));
    },

    async persistDeltaLink(id, delta_link, last_synced_fields) {
      await db
        .update(m365GroupLinks)
        .set({
          deltaLink: delta_link,
          lastSyncedFields: last_synced_fields,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
          syncStatus: 'idle',
          lastError: null,
        })
        .where(eq(m365GroupLinks.id, id));
    },

    async tombstone(id) {
      await db
        .update(m365GroupLinks)
        .set({
          unlinkedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(m365GroupLinks.id, id));
    },
  };
}
