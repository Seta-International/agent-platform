// -- cross-schema-read: status.ts reads core.events for the last directory-run summary. The §11
// counters are emitted, never stored on a table this module owns (architecture §F.4.1).
import type { SessionScope } from '@seta/core';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../../db/schema/index.ts';
import { INTEGRATIONS_PERMISSIONS, requirePermission } from '../../rbac.ts';
import type { DirectoryRepo } from './repo.ts';

/** Design §11, in the order the run-status region reads them. */
const COUNTER_KEYS = [
  'users_seen',
  'users_filtered',
  'users_created',
  'users_updated',
  'users_unchanged',
  'users_collided',
  'users_removed',
  'org_units_created',
  'org_units_renamed',
  'heads_set',
  'manager_ambiguous',
  'photos_stored',
  'photos_missing',
  'mailbox_forbidden',
] as const;

export type DirectoryCounterKey = (typeof COUNTER_KEYS)[number];

export interface DirectoryRunSummary {
  occurred_at: string;
  full: boolean;
  counters: Record<DirectoryCounterKey, number>;
}

export type DirectoryRunReader = (tenantId: string) => Promise<DirectoryRunSummary | null>;

/**
 * The last `integrations.m365.directory.synced` event for a tenant.
 *
 * Reading the outbox is the only way to answer "what did the last run do": the cursor columns on
 * `m365_tenant_config` record that a run happened and whether it succeeded, but the counters exist
 * solely in the event payload. Covered by `events_aggregate_idx (aggregate_type, aggregate_id,
 * occurred_at)`, so this is an index-ordered fetch of one row, not a partition scan.
 */
export function createDirectoryRunReader(db: NodePgDatabase<typeof schema>): DirectoryRunReader {
  return async (tenantId) => {
    const result = await db.execute(sql`
      SELECT occurred_at, payload
      FROM core.events
      WHERE aggregate_type = 'integrations.m365.directory'
        AND aggregate_id = ${tenantId}
        AND event_type = 'integrations.m365.directory.synced'
        AND tenant_id = ${tenantId}::uuid
      ORDER BY occurred_at DESC
      LIMIT 1
    `);
    const row = (result.rows as Array<{ occurred_at: Date | string; payload: unknown }>)[0];
    if (!row) return null;

    const payload = (
      typeof row.payload === 'object' && row.payload !== null ? row.payload : {}
    ) as Record<string, unknown>;
    const counters = {} as Record<DirectoryCounterKey, number>;
    for (const key of COUNTER_KEYS) {
      counters[key] = typeof payload[key] === 'number' ? (payload[key] as number) : 0;
    }
    return {
      occurred_at: (row.occurred_at instanceof Date
        ? row.occurred_at
        : new Date(row.occurred_at)
      ).toISOString(),
      full: payload.full === true,
      counters,
    };
  };
}

export interface DirectoryStatus {
  /** False when the tenant has no `m365_tenant_config` row — an unconfigured screen, not an error. */
  configured: boolean;
  last_synced_at: string | null;
  last_status: string | null;
  last_error: string | null;
  /**
   * Whether a delta cursor is stored. The link itself is never returned: it carries a Graph delta
   * token, and the screen only needs to know whether the next run is incremental.
   */
  cursor_present: boolean;
  last_run: DirectoryRunSummary | null;
  open_conflicts: number;
}

export interface DirectoryStatusDeps {
  repo: DirectoryRepo;
  lastRun: DirectoryRunReader;
}

/**
 * What the admin screen's run-status region renders (design §9.3): when the last run happened, how
 * it ended — including the `error` state `runDirectoryPull` records before rethrowing for retry —
 * and the §11 counters.
 */
export async function getDirectoryStatus(
  input: { session: SessionScope },
  deps: DirectoryStatusDeps,
): Promise<DirectoryStatus> {
  const { session } = input;
  requirePermission(session, INTEGRATIONS_PERMISSIONS.m365Read);

  const tenantId = session.tenant_id;
  const state = await deps.repo.getDirectoryState(tenantId);
  const [lastRun, openConflicts] = await Promise.all([
    deps.lastRun(tenantId),
    deps.repo.listConflicts(tenantId, 'open'),
  ]);

  return {
    configured: state !== null,
    last_synced_at: state?.syncedAt ? state.syncedAt.toISOString() : null,
    last_status: state?.lastStatus ?? null,
    last_error: state?.lastError ?? null,
    cursor_present: Boolean(state?.deltaLink),
    last_run: lastRun,
    open_conflicts: openConflicts.length,
  };
}
