import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../../db/schema/index.ts';
import type {
  ConflictSubjectType,
  DirectoryConflictKind,
  DirectoryConflictStatus,
  OrgUnitLinkKind,
} from '../../db/schema/index.ts';
import {
  m365DirectoryConflict,
  m365OrgUnitLinks,
  m365PersonLinks,
  m365TenantConfig,
} from '../../db/schema/index.ts';

export type PersonLinkRow = typeof m365PersonLinks.$inferSelect;
export type OrgUnitLinkRow = typeof m365OrgUnitLinks.$inferSelect;
export type ConflictRow = typeof m365DirectoryConflict.$inferSelect;

export interface UpsertPersonLinkInput {
  tenantId: string;
  personId: string;
  entraOid: string;
  managerOid?: string | null;
  department?: string | null;
  division?: string | null;
  photoMediaEtag?: string | null;
}

export interface UpsertOrgUnitLinkInput {
  tenantId: string;
  orgUnitId: string;
  entraKey: string;
  kind: OrgUnitLinkKind;
}

export interface RaiseConflictInput {
  tenantId: string;
  kind: DirectoryConflictKind;
  subjectType: ConflictSubjectType;
  subjectId?: string | null;
  entraOid?: string | null;
  detail: unknown;
}

export interface CloseConflictInput {
  tenantId: string;
  id: string;
  status: 'resolved' | 'ignored';
  resolution: unknown;
  resolvedBy: string;
}

/** The directory-sync cursor and last-run outcome, as held on `m365_tenant_config`. */
export interface DirectoryStateRow {
  deltaLink: string | null;
  syncedAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
}

export interface CreateDirectoryRepoDeps {
  db: NodePgDatabase<typeof schema>;
}

export interface DirectoryRepo {
  listPersonLinks(tenantId: string): Promise<PersonLinkRow[]>;
  findPersonLinkByOid(tenantId: string, entraOid: string): Promise<PersonLinkRow | null>;
  upsertPersonLink(input: UpsertPersonLinkInput): Promise<void>;
  markRemoved(tenantId: string, entraOid: string): Promise<void>;

  listOrgUnitLinks(tenantId: string): Promise<OrgUnitLinkRow[]>;
  upsertOrgUnitLink(input: UpsertOrgUnitLinkInput): Promise<void>;
  deleteOrgUnitLink(tenantId: string, orgUnitId: string): Promise<void>;

  /** `null` when the tenant has no `m365_tenant_config` row at all. */
  getDirectoryState(tenantId: string): Promise<DirectoryStateRow | null>;
  /** Advances the cursor. Called only after a run has completed in full (design §8, step 13). */
  recordDirectorySuccess(input: { tenantId: string; deltaLink: string }): Promise<void>;
  /**
   * Records a failed run WITHOUT touching `directory_delta_link`, so the next run re-reads the
   * window that failed instead of skipping it. Deliberately a standalone statement: written from
   * a `catch`, it must commit even though whatever was in flight did not.
   */
  recordDirectoryFailure(input: { tenantId: string; error: string }): Promise<void>;

  raiseConflict(input: RaiseConflictInput): Promise<void>;
  listConflicts(tenantId: string, status: DirectoryConflictStatus): Promise<ConflictRow[]>;
  getConflict(tenantId: string, id: string): Promise<ConflictRow | null>;
  closeConflict(input: CloseConflictInput): Promise<void>;
}

export function createDirectoryRepo(deps: CreateDirectoryRepoDeps): DirectoryRepo {
  const { db } = deps;

  return {
    async listPersonLinks(tenantId) {
      return db.select().from(m365PersonLinks).where(eq(m365PersonLinks.tenantId, tenantId));
    },

    async findPersonLinkByOid(tenantId, entraOid) {
      const [row] = await db
        .select()
        .from(m365PersonLinks)
        .where(and(eq(m365PersonLinks.tenantId, tenantId), eq(m365PersonLinks.entraOid, entraOid)))
        .limit(1);
      return row ?? null;
    },

    async upsertPersonLink(input) {
      // onConflictDoUpdate with target matching m365_person_links_uniq_oid (tenant_id, entra_oid)
      await db
        .insert(m365PersonLinks)
        .values({
          tenantId: input.tenantId,
          personId: input.personId,
          entraOid: input.entraOid,
          managerOid: input.managerOid ?? null,
          department: input.department ?? null,
          division: input.division ?? null,
          photoMediaEtag: input.photoMediaEtag ?? null,
        })
        .onConflictDoUpdate({
          target: [m365PersonLinks.tenantId, m365PersonLinks.entraOid],
          set: {
            personId: input.personId,
            managerOid: input.managerOid ?? null,
            department: input.department ?? null,
            division: input.division ?? null,
            photoMediaEtag: input.photoMediaEtag ?? null,
            removedAt: null,
            updatedAt: sql`now()`,
          },
        });
    },

    async markRemoved(tenantId, entraOid) {
      await db
        .update(m365PersonLinks)
        .set({ removedAt: sql`now()`, updatedAt: sql`now()` })
        .where(and(eq(m365PersonLinks.tenantId, tenantId), eq(m365PersonLinks.entraOid, entraOid)));
    },

    async listOrgUnitLinks(tenantId) {
      return db.select().from(m365OrgUnitLinks).where(eq(m365OrgUnitLinks.tenantId, tenantId));
    },

    async upsertOrgUnitLink(input) {
      // onConflictDoUpdate with target matching m365_org_unit_links_uniq_key (tenant_id, entra_key)
      await db
        .insert(m365OrgUnitLinks)
        .values({
          tenantId: input.tenantId,
          orgUnitId: input.orgUnitId,
          entraKey: input.entraKey,
          kind: input.kind,
        })
        .onConflictDoUpdate({
          target: [m365OrgUnitLinks.tenantId, m365OrgUnitLinks.entraKey],
          set: {
            orgUnitId: input.orgUnitId,
            kind: input.kind,
            updatedAt: sql`now()`,
          },
        });
    },

    async deleteOrgUnitLink(tenantId, orgUnitId) {
      await db
        .delete(m365OrgUnitLinks)
        .where(
          and(eq(m365OrgUnitLinks.tenantId, tenantId), eq(m365OrgUnitLinks.orgUnitId, orgUnitId)),
        );
    },

    async getDirectoryState(tenantId) {
      const [row] = await db
        .select({
          deltaLink: m365TenantConfig.directoryDeltaLink,
          syncedAt: m365TenantConfig.directorySyncedAt,
          lastStatus: m365TenantConfig.directoryLastStatus,
          lastError: m365TenantConfig.directoryLastError,
        })
        .from(m365TenantConfig)
        .where(eq(m365TenantConfig.tenantId, tenantId))
        .limit(1);
      return row ?? null;
    },

    async recordDirectorySuccess(input) {
      await db
        .update(m365TenantConfig)
        .set({
          directoryDeltaLink: input.deltaLink,
          directorySyncedAt: sql`now()`,
          directoryLastStatus: 'ok',
          directoryLastError: null,
        })
        .where(eq(m365TenantConfig.tenantId, input.tenantId));
    },

    async recordDirectoryFailure(input) {
      await db
        .update(m365TenantConfig)
        .set({ directoryLastStatus: 'error', directoryLastError: input.error })
        .where(eq(m365TenantConfig.tenantId, input.tenantId));
    },

    async raiseConflict(input) {
      const subjectId = input.subjectId ?? null;
      const entraOid = input.entraOid ?? null;
      await db
        .insert(m365DirectoryConflict)
        .values({
          tenantId: input.tenantId,
          kind: input.kind,
          subjectType: input.subjectType,
          subjectId,
          entraOid,
          detail: input.detail,
          status: 'open',
        })
        .onConflictDoUpdate({
          target: [
            m365DirectoryConflict.tenantId,
            m365DirectoryConflict.kind,
            m365DirectoryConflict.subjectType,
            m365DirectoryConflict.subjectId,
            m365DirectoryConflict.entraOid,
          ],
          targetWhere: sql`status = 'open'`,
          set: { detail: input.detail, lastSeenAt: sql`now()`, updatedAt: sql`now()` },
        });
    },

    async listConflicts(tenantId, status) {
      return db
        .select()
        .from(m365DirectoryConflict)
        .where(
          and(
            eq(m365DirectoryConflict.tenantId, tenantId),
            eq(m365DirectoryConflict.status, status),
          ),
        );
    },

    async getConflict(tenantId, id) {
      const [row] = await db
        .select()
        .from(m365DirectoryConflict)
        .where(and(eq(m365DirectoryConflict.tenantId, tenantId), eq(m365DirectoryConflict.id, id)))
        .limit(1);
      return row ?? null;
    },

    async closeConflict(input) {
      await db
        .update(m365DirectoryConflict)
        .set({
          status: input.status,
          resolution: input.resolution,
          resolvedBy: input.resolvedBy,
          resolvedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(m365DirectoryConflict.tenantId, input.tenantId),
            eq(m365DirectoryConflict.id, input.id),
          ),
        );
    },
  };
}
