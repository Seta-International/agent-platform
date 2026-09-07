import type { WorkflowApprovalRow } from '../api/schemas.ts';

// Minimal type-narrowing over the stored ApprovalCard payload (same defensive
// convention as hitl-approval-card.tsx): a stale or malformed payload degrades
// to raw user IDs instead of crashing the thread.
interface CandidateItem {
  id: string;
  label: string;
}
interface CardShape {
  intent?: string;
  details?: Array<{ kind: string; items?: CandidateItem[] }>;
  primary?: { argsPatch?: Record<string, unknown> };
  alternates?: Array<{ argsPatch?: Record<string, unknown> }>;
  meta?: { toolId?: unknown };
}

export const STATUS_LABELS: Record<string, string> = {
  approved: 'Approved',
  modified: 'Modified',
  rejected: 'Declined',
  superseded: 'Superseded',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

function asCard(payload: unknown): CardShape | null {
  if (!payload || typeof payload !== 'object') return null;
  return payload as CardShape;
}

export function cardIntent(payload: unknown): string | null {
  const intent = asCard(payload)?.intent;
  return typeof intent === 'string' ? intent : null;
}

/** The deciding tool's id (e.g. 'planner_proposeAssignment') from the card meta. */
export function cardToolId(payload: unknown): string | null {
  const toolId = asCard(payload)?.meta?.toolId;
  return typeof toolId === 'string' ? toolId : null;
}

function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function candidateLabels(payload: unknown): Map<string, string> {
  const details = asCard(payload)?.details;
  const items =
    details?.find((d) => d.kind === 'entityList' || d.kind === 'candidateList')?.items ?? [];
  return new Map(
    items
      .filter((i) => i && typeof i.id === 'string' && typeof i.label === 'string')
      .map((i) => [i.id, i.label]),
  );
}

/**
 * The user IDs the decision actually assigned.
 *
 * Three sources, in order. `override_user_ids` first — the canvas /decide route
 * still composes a set there. Then the BRANCH the chat client selected, resolved
 * off the persisted card exactly the way `selectArgsPatch` resolved it on the
 * server. Then primary, for rows decided before `chosen` was persisted.
 */
function assignedUserIds(approval: WorkflowApprovalRow): string[] {
  const dp = approval.decisionPayload as {
    override_user_ids?: unknown;
    chosen?: unknown;
    alternate_index?: unknown;
  } | null;
  const overrides = stringArray(dp?.override_user_ids);
  if (overrides.length > 0) return overrides;

  const card = asCard(approval.proposedPayload);
  if (dp?.chosen === 'alternate' && typeof dp.alternate_index === 'number') {
    const alt = card?.alternates?.[dp.alternate_index]?.argsPatch as
      | { assigneeUserIds?: unknown }
      | undefined;
    // Out of range is a stale or malformed row, not a reason to crash the
    // thread — fall through to primary, the same defensive convention the rest
    // of this file uses.
    const picked = stringArray(alt?.assigneeUserIds);
    if (picked.length > 0) return picked;
  }

  const patch = card?.primary?.argsPatch as { assigneeUserIds?: unknown } | undefined;
  return stringArray(patch?.assigneeUserIds);
}

/** "Alice, Bob" — display names resolved via the card's candidate list. */
export function assignedNames(approval: WorkflowApprovalRow): string {
  const labels = candidateLabels(approval.proposedPayload);
  return assignedUserIds(approval)
    .map((id) => labels.get(id) ?? id)
    .join(', ');
}

/**
 * The centered transcript status line for a resolved approval, or null while
 * it is still pending. HITL is the only source of transcript status lines.
 */
export function resolutionStatusLine(status: string): string | null {
  if (status === 'pending') return null;
  if (status === 'approved' || status === 'modified') return 'Approval granted';
  if (status === 'rejected') return 'Declined';
  return STATUS_LABELS[status] ?? status;
}

/** One-line outcome rendered under the decided-row heading. */
export function outcomeText(approval: WorkflowApprovalRow): string {
  if (approval.status === 'approved' || approval.status === 'modified') {
    const names = assignedNames(approval);
    return names ? `Task assigned to ${names}.` : 'Assignment confirmed.';
  }
  if (approval.status === 'rejected') return 'No changes made.';
  return 'No action taken.';
}
