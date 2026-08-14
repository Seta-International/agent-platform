import type { ApprovalCard } from '@seta/agent-sdk';
import { sql } from 'drizzle-orm';
import { agentDb } from '../db/index.ts';
import type { SessionLike } from '../types.ts';

// ─────────────────────────────────────────────────────────────────────────────
// "Which preview is open?" — the two read-only lookups the tiers above FUT-840's
// revision loop need.
//
// Both take the runtime filter as a PARAMETER. The agent tier may not import
// feature modules (`agent-no-feature-imports`), so it compares strings and never
// learns that `planner.action` exists — the same discipline documented in
// write-chat-approval-row.ts, and what keeps the recommend runtime out of the
// revision loop (design D2) without this file knowing its name either.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The two identity fields these lookups read, and nothing more.
 *
 * Neither function consults `effective_permissions` — the `tenant_id` +
 * `approver_user_id` predicates ARE the access check, the same way
 * `getPendingAssignRunIdForTask` filters `tenant_id` with no session at all.
 * Narrowing the parameter lets a caller that holds only an actor pair (the A2
 * `ActionPorts.preview` adapter in apps/server) satisfy it without fabricating a
 * permission set. A real `SessionLike` satisfies it structurally.
 */
export type PreviewScope = Pick<SessionLike, 'tenant_id' | 'user_id'>;

export interface OpenChatPreview {
  approvalId: string;
  /** The persisted card, verbatim. Cast rather than re-parsed: `meta` is a
   *  `z.object` that STRIPS unknown keys, so parsing here would quietly discard
   *  fields a newer producer added. The same treatment `decide-approval.ts`
   *  gives `proposed_payload`. */
  card: ApprovalCard;
  createdAt: Date;
  expiresAt: Date;
}

export interface FindOpenChatPreviewOpts {
  session: PreviewScope;
  threadId: string;
  /** Supplied by the caller, e.g. `['planner.action']`. */
  workflowIds: readonly string[];
}

function asDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

/**
 * The NEWEST pending chat preview addressed to this actor in this thread whose
 * run belongs to one of `workflowIds`, or null.
 *
 * Newest wins because that is how "this one" works in conversation (design D5).
 *
 * Deliberately NOT filtered on `expires_at` (spec §5). Expiry is a persisted
 * state the sweeper owns, and `recordApprovalDecision` checks status only — so a
 * row past its TTL that the sweeper has not claimed is still CONFIRMABLE. Adding
 * the filter here would produce a card the user can Confirm but not adjust, and
 * worse, a refusal loop: this returns null, the sentence is treated as a new
 * request, and the `task:` mutex — which matches `status='pending'` — refuses it,
 * so the user is told a proposal is already open for the proposal the system just
 * said did not exist. If unswept-expired rows are a defect, the fix belongs in
 * `recordApprovalDecision` and applies to Confirm, Cancel and revise together.
 *
 * `mastra_run_id IS NOT NULL` is the agentic-vs-evented discriminator: only a
 * native-suspend chat card can be revised, because only it re-enters a tool.
 *
 * No DDL: `workflow_approvals_approver_status_idx` on `(approver_user_id, status)`
 * already covers the selective half of this predicate.
 */
export async function findOpenChatPreview(
  opts: FindOpenChatPreviewOpts,
): Promise<OpenChatPreview | null> {
  // An empty filter must match NOTHING, not everything: `IN ()` is a syntax
  // error and a missing predicate would leak the assignment runtime's cards.
  if (opts.workflowIds.length === 0) return null;

  interface Row {
    approval_id: string;
    proposed_payload: unknown;
    created_at: Date | string;
    expires_at: Date | string;
  }
  const ids = sql.join(
    opts.workflowIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const res = await agentDb().execute(sql`
    SELECT a.approval_id, a.proposed_payload, a.created_at, a.expires_at
      FROM agent.workflow_approvals a
      JOIN agent.workflow_runs r ON r.run_id = a.run_id
     WHERE a.tenant_id         = ${opts.session.tenant_id}
       AND a.approver_user_id  = ${opts.session.user_id}
       AND a.surface_chat_thread_id = ${opts.threadId}
       AND a.status            = 'pending'
       AND a.mastra_run_id IS NOT NULL
       AND r.workflow_id IN (${ids})
     ORDER BY a.created_at DESC
     LIMIT 1
  `);
  const rows = (res as unknown as { rows: Row[] }).rows ?? (res as unknown as Row[]);
  const row = rows[0];
  if (!row) return null;
  return {
    approvalId: row.approval_id,
    card: row.proposed_payload as ApprovalCard,
    createdAt: asDate(row.created_at),
    expiresAt: asDate(row.expires_at),
  };
}

export interface FindOpenPreviewsForTasksOpts {
  session: PreviewScope;
  dedupKeys: readonly string[];
}

/**
 * Which of `dedupKeys` a pending card in this TENANT already holds.
 *
 * A courtesy, not the guarantee: it lets a tool refuse in a sentence BEFORE the
 * model narrates a preview that the writer would then drop. The guarantee is the
 * advisory lock inside `writeChatApprovalRow` (design D16) — this cannot be it,
 * because two concurrent turns both see a clear table.
 *
 * Tenant-scoped with NO approver filter, matching the assign mutex
 * (`getPendingAssignRunIdForTask`) — design D18. Consequence the caller must
 * honour: user B's open preview can block user A, so the refusal sentence must
 * not name the other person.
 *
 * Reads the plural field only. A legacy row can carry nothing but
 * `meta.dedupKey: 'assign:<id>'`, so a tolerant `OR` here would be dead code —
 * the legacy shape is handled where it does work, in the two assign consumers.
 */
export async function findOpenPreviewsForTasks(
  opts: FindOpenPreviewsForTasksOpts,
): Promise<string[]> {
  if (opts.dedupKeys.length === 0) return [];
  const keys = sql.join(
    opts.dedupKeys.map((k) => sql`${k}`),
    sql`, `,
  );
  const res = await agentDb().execute(sql`
    SELECT DISTINCT k.key
      FROM agent.workflow_approvals a
      CROSS JOIN LATERAL jsonb_array_elements_text(
        COALESCE(a.proposed_payload -> 'meta' -> 'dedupKeys', '[]'::jsonb)
      ) AS k(key)
     WHERE a.tenant_id = ${opts.session.tenant_id}
       AND a.status    = 'pending'
       AND k.key IN (${keys})
  `);
  const rows =
    (res as unknown as { rows: Array<{ key: string }> }).rows ??
    (res as unknown as Array<{ key: string }>);
  return rows.map((r) => r.key);
}
