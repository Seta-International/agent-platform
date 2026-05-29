import type { WorkflowApprovalRow } from '../workflows/api/schemas.ts';

export type ApprovalDecision = 'approve' | 'reject' | 'modify';

// The intent string lives on the stored ApprovalCard (proposedPayload). We read
// it defensively — proposedPayload is typed `unknown` and may be null for older
// rows or non-card payloads.
function intentFromApproval(approval: WorkflowApprovalRow): string | null {
  const payload = approval.proposedPayload;
  if (!payload || typeof payload !== 'object') return null;
  const intent = (payload as { intent?: unknown }).intent;
  return typeof intent === 'string' && intent.trim().length > 0 ? intent : null;
}

/**
 * Build the user-role message that the chat thread appends after a HITL approval
 * card is decided, to trigger the agent's follow-up turn.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Chat-flow HITL (e.g. planner_proposeAssignment) executes the approved action
 * server-side in the decide-approval endpoint via a ChatHitlDecider — a plain
 * domain call that NEVER appears in the conversation as a tool result. The only
 * thing the model previously saw on the follow-up turn was a bare "Approved",
 * while its message history still showed the action as merely *proposed*
 * (the tool returned `{ kind: 'pending-approval' }`). With nothing telling it
 * the action already ran, the agent re-executed it — surfacing a second,
 * redundant approval card for an assignment that was already applied.
 *
 * This message closes that semantic gap: it states the proposed action has
 * already been carried out (or declined) by the system, and instructs the agent
 * to acknowledge the result rather than perform it again.
 */
export function buildDecisionFollowupMessage(
  decision: ApprovalDecision,
  approval: WorkflowApprovalRow,
): string {
  const intent = intentFromApproval(approval);
  const subject = intent ? `the proposed action ("${intent}")` : 'the proposed action shown above';

  if (decision === 'reject') {
    return (
      `[Decision recorded] I declined ${subject}. It was NOT performed. ` +
      `Acknowledge this in my language and ask what I'd like to do next — ` +
      `do not propose or perform that action again.`
    );
  }

  if (decision === 'modify') {
    return (
      `[Decision recorded] I approved ${subject} with my own modifications. ` +
      `The system has already carried it out with my changes — it is now complete. ` +
      `Confirm the result to me in my language. Do not propose, repeat, or re-run that action.`
    );
  }

  return (
    `[Decision recorded] I approved ${subject}. ` +
    `The system has already carried it out — it is now complete. ` +
    `Confirm the result to me in my language. Do not propose, repeat, or re-run that action.`
  );
}
