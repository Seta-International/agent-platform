import { and, eq, isNull, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../../db/schema/index.ts';
import { m365PlanLinks, m365ResourceEtags } from '../../db/schema/index.ts';

export type PlanLink = typeof m365PlanLinks.$inferSelect;
export type ResourceEtag = typeof m365ResourceEtags.$inferSelect;

import type { SyncStatus } from '../repo.ts';

export type { SyncStatus } from '../repo.ts';
export type ResourceType =
  | 'plan'
  | 'planDetails'
  | 'bucket'
  | 'task'
  | 'taskDetails'
  | 'bucketTaskBoardTaskFormat'
  | 'assignment';

export interface CreateM365PlanLinkRepoDeps {
  db: NodePgDatabase<typeof schema>;
}

export interface M365PlanLinkRepo {
  findByPlan(planId: string): Promise<PlanLink | null>;
  findByExternal(tenantId: string, externalId: string): Promise<PlanLink | null>;
  listByGroup(tenantId: string, groupId: string): Promise<PlanLink[]>;
  upsert(input: {
    tenantId: string;
    groupId: string;
    planId: string;
    externalId: string;
    initialSnapshot: unknown;
  }): Promise<PlanLink>;
  setSyncStatus(id: string, status: SyncStatus, lastError?: string | null): Promise<void>;
  persistSnapshot(id: string, snapshot: unknown): Promise<void>;
  tombstone(id: string): Promise<void>;
  listAllLive(): Promise<PlanLink[]>;
}

export function createM365PlanLinkRepo(deps: CreateM365PlanLinkRepoDeps): M365PlanLinkRepo {
  const { db } = deps;

  return {
    async findByPlan(planId) {
      const [row] = await db
        .select()
        .from(m365PlanLinks)
        .where(and(eq(m365PlanLinks.planId, planId), isNull(m365PlanLinks.unlinkedAt)))
        .limit(1);
      return row ?? null;
    },

    async findByExternal(tenantId, externalId) {
      const [row] = await db
        .select()
        .from(m365PlanLinks)
        .where(
          and(
            eq(m365PlanLinks.tenantId, tenantId),
            eq(m365PlanLinks.externalId, externalId),
            isNull(m365PlanLinks.unlinkedAt),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async listByGroup(tenantId, groupId) {
      return db
        .select()
        .from(m365PlanLinks)
        .where(
          and(
            eq(m365PlanLinks.tenantId, tenantId),
            eq(m365PlanLinks.groupId, groupId),
            isNull(m365PlanLinks.unlinkedAt),
          ),
        );
    },

    async upsert(input) {
      // onConflictDoUpdate with targetWhere to match the partial unique index
      // (tenant_id, plan_id) WHERE unlinked_at IS NULL
      const [row] = await db
        .insert(m365PlanLinks)
        .values({
          tenantId: input.tenantId,
          groupId: input.groupId,
          planId: input.planId,
          externalId: input.externalId,
          lastSyncedSnapshot: input.initialSnapshot,
          syncStatus: 'idle',
        })
        .onConflictDoUpdate({
          target: [m365PlanLinks.tenantId, m365PlanLinks.planId],
          targetWhere: sql`unlinked_at IS NULL`,
          set: {
            externalId: input.externalId,
            updatedAt: new Date(),
          },
        })
        .returning();
      return row as PlanLink;
    },

    async setSyncStatus(id, status, lastError = null) {
      await db
        .update(m365PlanLinks)
        .set({
          syncStatus: status,
          lastError,
          updatedAt: new Date(),
        })
        .where(eq(m365PlanLinks.id, id));
    },

    async persistSnapshot(id, snapshot) {
      await db
        .update(m365PlanLinks)
        .set({
          lastSyncedSnapshot: snapshot,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(m365PlanLinks.id, id));
    },

    async tombstone(id) {
      await db
        .update(m365PlanLinks)
        .set({
          unlinkedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(m365PlanLinks.id, id));
    },

    async listAllLive() {
      return db.select().from(m365PlanLinks).where(isNull(m365PlanLinks.unlinkedAt));
    },
  };
}

export interface CreateM365ResourceEtagRepoDeps {
  db: NodePgDatabase<typeof schema>;
}

export interface M365ResourceEtagRepo {
  get(planLinkId: string, resourceType: ResourceType, setaId: string): Promise<ResourceEtag | null>;
  listForLink(planLinkId: string, resourceType?: ResourceType): Promise<ResourceEtag[]>;
  upsert(input: {
    tenantId: string;
    planLinkId: string;
    resourceType: ResourceType;
    setaId: string;
    externalId: string;
    etag: string;
    lastSyncedFields: unknown;
  }): Promise<void>;
  remove(planLinkId: string, resourceType: ResourceType, setaId: string): Promise<void>;
}

export function createM365ResourceEtagRepo(
  deps: CreateM365ResourceEtagRepoDeps,
): M365ResourceEtagRepo {
  const { db } = deps;

  return {
    async get(planLinkId, resourceType, setaId) {
      const [row] = await db
        .select()
        .from(m365ResourceEtags)
        .where(
          and(
            eq(m365ResourceEtags.planLinkId, planLinkId),
            eq(m365ResourceEtags.resourceType, resourceType),
            eq(m365ResourceEtags.setaId, setaId),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async listForLink(planLinkId, resourceType) {
      const filters = [eq(m365ResourceEtags.planLinkId, planLinkId)];
      if (resourceType !== undefined) {
        filters.push(eq(m365ResourceEtags.resourceType, resourceType));
      }
      return db
        .select()
        .from(m365ResourceEtags)
        .where(and(...filters));
    },

    async upsert(input) {
      await db
        .insert(m365ResourceEtags)
        .values({
          tenantId: input.tenantId,
          planLinkId: input.planLinkId,
          resourceType: input.resourceType,
          setaId: input.setaId,
          externalId: input.externalId,
          etag: input.etag,
          lastSyncedFields: input.lastSyncedFields,
        })
        .onConflictDoUpdate({
          target: [
            m365ResourceEtags.tenantId,
            m365ResourceEtags.planLinkId,
            m365ResourceEtags.resourceType,
            m365ResourceEtags.setaId,
          ],
          set: {
            etag: input.etag,
            lastSyncedFields: input.lastSyncedFields,
            updatedAt: new Date(),
          },
        });
    },

    async remove(planLinkId, resourceType, setaId) {
      await db
        .delete(m365ResourceEtags)
        .where(
          and(
            eq(m365ResourceEtags.planLinkId, planLinkId),
            eq(m365ResourceEtags.resourceType, resourceType),
            eq(m365ResourceEtags.setaId, setaId),
          ),
        );
    },
  };
}
