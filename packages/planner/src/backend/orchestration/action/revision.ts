import type { ActorRef, PreviewPort } from './ports.ts';
import type { ActionOpenPreview } from './schemas.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Is this call an ADJUSTMENT of the open preview, or a new request? (FUT-840)
//
// Everything shared by the six write tools lives here. Merging does NOT: each
// tool merges differently, so six small merges is the honest shape (spec §3.4).
// This module decides only WHETHER a call is a revision and WHAT it revises.
// ─────────────────────────────────────────────────────────────────────────────

/** A persisted card whose argsPatch is missing what the revision needs. Rare —
 *  a card minted before a tool shipped, or a truncated payload — and refusing
 *  beats rebuilding a proposal from half a card. */
export const INCOMPLETE_PREVIEW =
  'That preview is incomplete. Cancel it and tell me the change again.';

export type ResolveRevisionResult =
  | { kind: 'new' }
  | { kind: 'revision'; previousApprovalId: string; previousArgsPatch: Record<string, unknown> };

export interface ResolveRevisionOpts {
  preview: PreviewPort;
  actor: ActorRef;
  /** What the SERVER found open for this thread, or null. Arrives through the run
   *  context, never through tool arguments — which is the whole point. */
  openPreview: ActionOpenPreview | null | undefined;
  /** The tool asking. */
  toolId: string;
  /** The tasks THIS turn resolved from the model's refs. Empty means the turn
   *  resolved none, which is how create behaves and how a tool whose refs are
   *  absent behaves. */
  resolvedTaskIds: readonly string[];
}

/**
 * Decide whether this call adjusts the open preview — with no input from the
 * model (design D20, replacing D15).
 *
 * D15 asked the model for `revisionOf` and then required it to EQUAL the id the
 * server had just injected. A value that must equal a value the receiver already
 * holds carries no information: it was a 36-character encoding of one bit, in the
 * format a small model is least reliable at. Eight consecutive production turns
 * omitted it, so the revision branch never ran and the `task:` mutex refused
 * every adjustment. The server holds every fact needed to decide, so it decides.
 *
 * This is STRICTER than D15, not looser. D15's threat was hostile text naming a
 * different valid approval id to retarget a change; with no field to name, the
 * attack cannot be expressed at all (FUT-824).
 *
 * Four asserts, cheapest first:
 *
 *  1. No open preview → a new request.
 *  2. The card's tool must equal the calling tool. A mismatch falls through to
 *     `new` rather than refusing, and that is deliberate: it is what lets "create
 *     a task for the release notes" through while an update preview waits (AC3),
 *     while "và giao cho Tuấn nữa" on the SAME task still gets refused — by the
 *     `task:` mutex on the new-card path, which reaches the design-D4 outcome
 *     through one mechanism instead of two.
 *  3. If the turn resolved tasks of its own, they must be the card's tasks. This
 *     is the check D15 never had: when the model names a task explicitly, a
 *     mismatch now falls through to a new card instead of adjusting whichever
 *     card happened to be newest. Decided BEFORE the load, so a different task
 *     costs no query.
 *  4. Load the row. Null means it was decided, swept or re-homed between the
 *     server's lookup and this call — across an LLM turn — so treat the turn as a
 *     new request and let the mutex speak if it must.
 *
 * Which card is "the" open one when several are pending stays design D5: newest
 * wins, enforced by `ORDER BY created_at DESC LIMIT 1` in the finder. Unchanged
 * from Part 3 — the model could only ever name the single card it was shown, so
 * the outcome for a two-card user is the same as before.
 */
export async function resolveRevision(opts: ResolveRevisionOpts): Promise<ResolveRevisionResult> {
  const open = opts.openPreview;
  if (!open) return { kind: 'new' };
  if (open.toolId !== opts.toolId) return { kind: 'new' };
  if (opts.resolvedTaskIds.length > 0 && !sameTaskSet(open.taskIds, opts.resolvedTaskIds)) {
    return { kind: 'new' };
  }

  const loaded = await opts.preview.loadPreview({ ...opts.actor, approvalId: open.approvalId });
  if (!loaded) return { kind: 'new' };

  return {
    kind: 'revision',
    previousApprovalId: loaded.approvalId,
    previousArgsPatch: loaded.argsPatch,
  };
}

/** Order-insensitive: a batch's refs and a card's targets need not agree on order
 *  for it to be the same change. */
function sameTaskSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = new Set(a);
  return b.every((id) => left.has(id));
}

/**
 * The one-preview-per-task mutex, as a sentence instead of a dropped card.
 *
 * A courtesy, not the guarantee. The guarantee is the advisory lock inside
 * `writeChatApprovalRow` (design D16), which cannot be replaced by a check here:
 * two concurrent turns both see a clear table. What this buys is the ORDINARY
 * case — one user, two sequential requests — answered with an explanation rather
 * than with a narrated preview that never appears.
 *
 * Called on the NEW-card path only. A revision's own card holds the same key, and
 * the writer voids it in the same transaction, so checking here would refuse
 * every adjustment.
 *
 * Names no person: the mutex is per TENANT (design D18), so the blocking card may
 * be another approver's.
 */
export async function refuseIfPreviewOpen(opts: {
  preview: PreviewPort;
  actor: ActorRef;
  taskIds: readonly string[];
  /**
   * Keys whose presence means the writer will REUSE the open card rather than
   * refuse — so this must stay quiet and let it.
   *
   * This mirrors the writer's precedence rule instead of restating it: a card's
   * keys are evaluated in declaration order and the first hit wins. An assign
   * card declares `assign:` before `task:`, so a pending assign proposal resolves
   * as FUT-806's reuse. Checking `task:` alone would refuse exactly that case and
   * silently delete a working behaviour.
   */
  reuseKeys?: readonly string[];
}): Promise<string | null> {
  if (opts.taskIds.length === 0) return null;
  const taskKeys = opts.taskIds.map((id) => `task:${id}`);
  const reuseKeys = opts.reuseKeys ?? [];
  const taken = await opts.preview.takenDedupKeys({
    ...opts.actor,
    // One round trip, reuse keys first — the same order the writer reads them in.
    dedupKeys: [...reuseKeys, ...taskKeys],
  });
  if (reuseKeys.some((key) => taken.includes(key))) return null;
  const clashing = taken.filter((key) => taskKeys.includes(key));
  if (clashing.length === 0) return null;
  return clashing.length === 1
    ? 'There is already a proposal waiting for that task. Confirm or cancel it ' +
        'first, then ask me again.'
    : 'There are already proposals waiting for those tasks. Confirm or cancel ' +
        'them first, then ask me again.';
}

/**
 * The tasks a persisted argsPatch is about — every card shape, because Part 4's
 * server-side revision matching compares this against the tasks the turn
 * resolved, and a shape it cannot read would silently match nothing.
 *
 * Four shapes: update and bulk carry `targets: [{ taskId, expectedVersion }]`;
 * assign and comment carry a bare `taskId`; link and merge name their two
 * endpoints. A create draft has no task yet and correctly yields nothing.
 */
export function taskIdsFromArgsPatch(argsPatch: Record<string, unknown>): string[] {
  const { targets, taskId, sourceTaskId, targetTaskId, duplicateTaskId, keepTaskId } = argsPatch;
  if (Array.isArray(targets)) {
    return targets
      .map((t) => (t as { taskId?: unknown } | null)?.taskId)
      .filter((id): id is string => typeof id === 'string');
  }
  const pair = [sourceTaskId ?? duplicateTaskId, targetTaskId ?? keepTaskId].filter(
    (id): id is string => typeof id === 'string',
  );
  if (pair.length > 0) return pair;
  return typeof taskId === 'string' ? [taskId] : [];
}

/** A persisted argsPatch field that must be a string, or undefined. */
export function stringField(argsPatch: Record<string, unknown>, key: string): string | undefined {
  const v = argsPatch[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
