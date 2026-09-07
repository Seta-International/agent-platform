import type { ActorRef, PreviewPort } from './ports.ts';
import type { ActionOpenPreview } from './schemas.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Is this call an ADJUSTMENT of the open preview, or a new request? (FUT-840)
//
// Everything shared by the six write tools lives here. Merging does NOT: each
// tool merges differently, so six small merges is the honest shape (spec §3.4).
// This module decides only WHETHER a call is a revision and WHAT it revises.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One sentence for "that is not the preview that is open", whether the id is
 * simply wrong, belongs to somebody else, or names a row that has since been
 * decided.
 *
 * Deliberately indistinguishable across those cases: FUT-824's property is that
 * a UUID appearing in text buys no access, and a refusal that distinguished
 * "no such approval" from "not yours" would answer the question an attacker is
 * asking.
 */
export const NOT_THE_OPEN_PREVIEW =
  'I can only change the preview that is open right now. Tell me what to change ' +
  'about it, or cancel it and ask me again.';

/** Design D4: changing the KIND of change is not an adjustment. */
export const DIFFERENT_KIND_OF_CHANGE =
  'That preview is a different kind of change. Confirm or cancel it first, and ' +
  'then ask me for this one.';

/** A persisted card whose argsPatch is missing what the revision needs. Rare —
 *  a card minted before a tool shipped, or a truncated payload — and refusing
 *  beats rebuilding a proposal from half a card. */
export const INCOMPLETE_PREVIEW =
  'That preview is incomplete. Cancel it and tell me the change again.';

export type ResolveRevisionResult =
  | { kind: 'new' }
  | { kind: 'refused'; refusal: string }
  | { kind: 'revision'; previousApprovalId: string; previousArgsPatch: Record<string, unknown> };

export interface ResolveRevisionOpts {
  preview: PreviewPort;
  actor: ActorRef;
  /** What the MODEL asked to revise. */
  revisionOf: string | undefined;
  /** What the SERVER found open for this turn. Arrives through the run context,
   *  never through tool arguments — which is the whole point. */
  openPreview: ActionOpenPreview | null | undefined;
  /** The tool asking. */
  toolId: string;
}

/**
 * Decide whether this call adjusts the open preview.
 *
 * Three asserts, in this order, and the order is the security argument:
 *
 *  1. `revisionOf` ABSENT → a new request. Never refused (design D15): AC3's
 *     second bullet is expressed exactly that way, and refusing would break
 *     "create a task for the release notes" typed while an update preview waits.
 *  2. `revisionOf` must EQUAL the server-injected approval id. Scoping the load
 *     on tenant + approver + toolId is not enough on its own, because targets
 *     come FROM the card: a valid-but-different approval id of the same user is a
 *     silent retarget — "make it Friday" about task A becomes a Friday card for
 *     task B, and B's card is voided. Binding to the row the SERVER chose brings
 *     tenant, actor, thread, workflow and status along for free. Checked BEFORE
 *     the load, so a mismatched id costs no query and reveals nothing.
 *  3. The card's `meta.toolId` must equal the calling tool. This is where design
 *     D4 stops being prompt text: "và giao cho Tuấn nữa" on an update preview
 *     reaches the assign tool, which refuses rather than superseding the update
 *     card and silently losing the due-date change.
 */
export async function resolveRevision(opts: ResolveRevisionOpts): Promise<ResolveRevisionResult> {
  if (!opts.revisionOf) return { kind: 'new' };

  const expected = opts.openPreview?.approvalId;
  if (!expected || opts.revisionOf !== expected) {
    return { kind: 'refused', refusal: NOT_THE_OPEN_PREVIEW };
  }

  const loaded = await opts.preview.loadPreview({
    ...opts.actor,
    approvalId: opts.revisionOf,
  });
  // Null means the row was decided, expired-and-swept, or belongs to another
  // runtime — all between the server's lookup and this call, i.e. across an LLM
  // turn. Same sentence as a mismatch.
  if (!loaded) return { kind: 'refused', refusal: NOT_THE_OPEN_PREVIEW };

  if (loaded.toolId !== opts.toolId) {
    return { kind: 'refused', refusal: DIFFERENT_KIND_OF_CHANGE };
  }

  return {
    kind: 'revision',
    previousApprovalId: loaded.approvalId,
    previousArgsPatch: loaded.argsPatch,
  };
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
 * The tasks a persisted argsPatch is about.
 *
 * Two shapes, because the cards have two: update and bulk carry
 * `targets: [{ taskId, expectedVersion }]`, while assign and comment carry a bare
 * `taskId`. Link and merge name their endpoints with their own field names and
 * read them directly.
 */
export function taskIdsFromArgsPatch(argsPatch: Record<string, unknown>): string[] {
  const { targets, taskId } = argsPatch;
  if (Array.isArray(targets)) {
    return targets
      .map((t) => (t as { taskId?: unknown } | null)?.taskId)
      .filter((id): id is string => typeof id === 'string');
  }
  return typeof taskId === 'string' ? [taskId] : [];
}

/** A persisted argsPatch field that must be a string, or undefined. */
export function stringField(argsPatch: Record<string, unknown>, key: string): string | undefined {
  const v = argsPatch[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
