import type { SessionEnv, WorkerHandle } from '@seta/core';
import type { Hono } from 'hono';
import { z } from 'zod';
import { DIRECTORY_CONFLICT_STATUS } from '../db/schema/index.ts';
import type { ConflictRow, DirectoryRepo } from '../m365/directory/repo.ts';
import type { PeopleResolutionSurface } from '../m365/directory/resolve.ts';
import { resolveDirectoryConflict } from '../m365/directory/resolve.ts';
import { type DirectoryRunReader, getDirectoryStatus } from '../m365/directory/status.ts';
import { directoryPullJobKey } from '../m365/jobs/directory-pull-cron.ts';
import { INTEGRATIONS_PERMISSIONS, IntegrationsError, requirePermission } from '../rbac.ts';

export interface M365DirectoryRoutesDeps {
  repo: DirectoryRepo;
  /** The real `@seta/people` surface (§9.2) — resolutions run through the module's public doors. */
  people: PeopleResolutionSurface;
  workers: WorkerHandle;
  lastRun: DirectoryRunReader;
}

const statusSchema = z.enum(DIRECTORY_CONFLICT_STATUS);
const resolveSchema = z.object({
  action: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});
const syncSchema = z.object({ full: z.boolean().optional() });

/** Snake_case wire shape; `detail` is passed through verbatim — §9.1 defines it per kind. */
function serializeConflict(row: ConflictRow): Record<string, unknown> {
  return {
    id: row.id,
    kind: row.kind,
    subject_type: row.subjectType,
    subject_id: row.subjectId,
    entra_oid: row.entraOid,
    detail: row.detail,
    status: row.status,
    resolution: row.resolution,
    resolved_by: row.resolvedBy,
    resolved_at: row.resolvedAt?.toISOString() ?? null,
    first_seen_at: row.firstSeenAt.toISOString(),
    last_seen_at: row.lastSeenAt.toISOString(),
  };
}

/**
 * The M365 directory-sync admin surface (design §9.2). Reads take `integrations.m365.read`, writes
 * take `integrations.m365.configure`.
 *
 * Every route derives its tenant from the session, never from the request, so another tenant's
 * conflicts are invisible rather than merely unresolvable.
 */
export function registerM365DirectoryRoutes(
  app: Hono<SessionEnv>,
  deps: M365DirectoryRoutesDeps,
): void {
  app.get('/api/integrations/m365/directory/conflicts', async (c) => {
    const session = c.get('user');
    requirePermission(session, INTEGRATIONS_PERMISSIONS.m365Read);

    const raw = c.req.query('status') ?? 'open';
    const parsed = statusSchema.safeParse(raw);
    if (!parsed.success) {
      throw new IntegrationsError(
        'INVALID_INPUT',
        `unknown conflict status '${raw}' (expected ${DIRECTORY_CONFLICT_STATUS.join(', ')})`,
      );
    }

    const rows = await deps.repo.listConflicts(session.tenant_id, parsed.data);
    return c.json({ conflicts: rows.map(serializeConflict) });
  });

  // Runs under the acting admin's session, never buildSystemSession: RBAC has to apply normally
  // and person_history has to attribute the change to a real human (§9.2). The
  // `integrations.m365.configure` check lives inside resolveDirectoryConflict, so it holds for
  // every caller of that function, not just this route.
  app.post('/api/integrations/m365/directory/conflicts/:id/resolve', async (c) => {
    const session = c.get('user');
    const parsed = resolveSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      throw new IntegrationsError('INVALID_INPUT', 'action is required');
    }

    const result = await resolveDirectoryConflict(
      {
        conflictId: c.req.param('id'),
        action: parsed.data.action,
        ...(parsed.data.params ? { params: parsed.data.params } : {}),
        session,
      },
      { repo: deps.repo, people: deps.people },
    );
    // A refusal ("still has members", "already resolved") is a 200 with resolved:false — the row
    // is intact and still queued, which is not the caller getting something wrong.
    return c.json(result.reason ? result : { resolved: result.resolved });
  });

  app.post('/api/integrations/m365/directory/sync', async (c) => {
    const session = c.get('user');
    requirePermission(session, INTEGRATIONS_PERMISSIONS.m365Configure);

    const parsed = syncSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) throw new IntegrationsError('INVALID_INPUT', 'full must be a boolean');
    // A full run is the reset: it ignores the stored cursor and is the only mode that reaps org
    // units (§10), which is why this route is gated on configure rather than read.
    const full = parsed.data.full ?? true;

    // Enqueued, never run inline: a directory pull walks the whole delta feed and must not be
    // bounded by an HTTP request. Same per-tenant jobKey as the cron, so a queued nightly run and
    // an admin-triggered one collapse instead of racing each other through the people surface.
    await deps.workers.addJob(
      'm365.directory.pull',
      { tenant_id: session.tenant_id, full },
      { jobKey: directoryPullJobKey(session.tenant_id) },
    );
    return c.json({ enqueued: true, full });
  });

  app.get('/api/integrations/m365/directory/status', async (c) => {
    const session = c.get('user');
    const status = await getDirectoryStatus(
      { session },
      { repo: deps.repo, lastRun: deps.lastRun },
    );
    return c.json(status);
  });
}
