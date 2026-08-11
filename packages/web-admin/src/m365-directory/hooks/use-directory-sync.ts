import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import {
  type DirectoryConflictRow,
  type DirectoryConflictStatus,
  type DirectorySyncStatus,
  getDirectorySyncStatus,
  listDirectoryConflicts,
  listOrgUnits,
  type OrgUnitOption,
  type ResolveConflictInput,
  type ResolveConflictResult,
  resolveDirectoryConflict,
  startDirectorySync,
} from '../api/directory-sync-client.ts';

export const directoryStatusQueryKey = ['admin', 'm365-directory', 'status'] as const;

export function directoryConflictsQueryKey(status: DirectoryConflictStatus) {
  return ['admin', 'm365-directory', 'conflicts', status] as const;
}

/** How often the status is re-read while a run is believed to be in flight. */
const IN_FLIGHT_POLL_MS = 4_000;
/**
 * Give up waiting after this long and re-enable the button. Without it, a worker that never picks
 * the job up would leave "Sync now" disabled forever with no way back short of a reload.
 */
const IN_FLIGHT_GIVE_UP_MS = 10 * 60_000;

/**
 * The backend records only `ok` / `error` — there is no in-progress row to read, and the job is
 * deliberately enqueued rather than run inline. So "a run is in flight" is inferred: from the
 * moment the enqueue succeeds until the status carries a different outcome than it did at that
 * moment. `last_error` and `last_status` are part of the mark because a failed run never advances
 * `last_synced_at`, and a run that fails still has to release the button.
 */
function runWatermark(status: DirectorySyncStatus | undefined): string {
  if (!status) return 'unknown';
  return [status.last_synced_at, status.last_status, status.last_error].join('|');
}

export function useDirectoryConflicts(status: DirectoryConflictStatus = 'open') {
  return useQuery<DirectoryConflictRow[]>({
    queryKey: directoryConflictsQueryKey(status),
    queryFn: () => listDirectoryConflicts(status),
  });
}

/**
 * Resolving changes both regions: the row leaves the queue, and `open_conflicts` in the run-status
 * summary moves with it.
 */
export function useResolveDirectoryConflict() {
  const qc = useQueryClient();
  return useMutation<ResolveConflictResult, Error, ResolveConflictInput>({
    mutationFn: (input) => resolveDirectoryConflict(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: directoryConflictsQueryKey('open') });
      void qc.invalidateQueries({ queryKey: directoryStatusQueryKey });
    },
  });
}

export const orgUnitsQueryKey = ['admin', 'm365-directory', 'org-units'] as const;

export interface OrgUnitsResult {
  units: OrgUnitOption[];
  error: Error | null;
  nameFor: (personId: string) => string | null;
}

/**
 * The org tree, fetched only when the queue actually needs it — a `reassign` target picker or a
 * name for a `user_removed` subject. It costs a second permission (`people.worker.read`), so a
 * queue that needs neither never asks for it, and a refusal degrades to bare ids rather than an
 * error banner over a page that is otherwise fine.
 */
export function useOrgUnits(enabled: boolean): OrgUnitsResult {
  const query = useQuery<OrgUnitOption[]>({
    queryKey: orgUnitsQueryKey,
    queryFn: () => listOrgUnits(),
    enabled,
  });

  const units = query.data ?? [];
  const nameFor = useCallback(
    (personId: string) => {
      for (const unit of units) {
        const member = unit.members?.find((m) => m.person_id === personId);
        if (member?.full_name) return member.full_name;
      }
      return null;
    },
    [units],
  );

  return { units, error: (query.error as Error | null) ?? null, nameFor };
}

export interface DirectorySyncController {
  status: DirectorySyncStatus | undefined;
  isLoading: boolean;
  error: Error | null;
  /** True from a successful enqueue until the status shows the run has ended (or the cap expires). */
  isRunInFlight: boolean;
  startSync: () => Promise<void>;
  startError: Error | null;
}

export function useDirectorySync(): DirectorySyncController {
  const qc = useQueryClient();
  const [pending, setPending] = useState<{ watermark: string; startedAt: number } | null>(null);

  const statusQuery = useQuery<DirectorySyncStatus>({
    queryKey: directoryStatusQueryKey,
    queryFn: () => getDirectorySyncStatus(),
    refetchInterval: pending ? IN_FLIGHT_POLL_MS : false,
  });

  const watermark = runWatermark(statusQuery.data);

  useEffect(() => {
    if (!pending) return;
    // The give-up check rides the same signal rather than a timer: while pending, the status is
    // polled every few seconds, so this is evaluated regularly by construction.
    if (watermark !== pending.watermark || Date.now() - pending.startedAt > IN_FLIGHT_GIVE_UP_MS) {
      setPending(null);
      // A finished run is exactly when the queue changed — conflicts are raised by the run itself.
      void qc.invalidateQueries({ queryKey: directoryConflictsQueryKey('open') });
    }
  }, [watermark, pending, qc]);

  const start = useMutation<{ enqueued: boolean; full: boolean }, Error, void>({
    mutationFn: () => startDirectorySync(),
    onSuccess: () => {
      // Read the freshest status from the cache, not the render-time closure: the mark has to be
      // the one the run is about to move.
      const current = qc.getQueryData<DirectorySyncStatus>(directoryStatusQueryKey);
      setPending({ watermark: runWatermark(current), startedAt: Date.now() });
    },
  });

  const startSync = useCallback(async () => {
    // Swallowed here and surfaced through `startError`: a failed enqueue is a message on the page,
    // not an unhandled rejection.
    await start.mutateAsync().catch(() => undefined);
  }, [start]);

  return {
    status: statusQuery.data,
    isLoading: statusQuery.isLoading,
    error: (statusQuery.error as Error | null) ?? null,
    isRunInFlight: start.isPending || pending !== null,
    startSync,
    startError: (start.error as Error | null) ?? null,
  };
}
