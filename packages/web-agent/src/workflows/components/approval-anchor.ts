import type { WorkflowApprovalRow } from '../api/schemas.ts';

/** A transcript message as assistant-ui exposes it: `data-approval` arrives
 *  normalized to `{ type: 'data', name: 'approval', data }`. */
interface AnchorMessage {
  content?: ReadonlyArray<unknown>;
}

/**
 * The toolCallIds anchored somewhere in the transcript — i.e. the approvals a
 * turn renders in place. Everything else has no home in the conversation and
 * must fall back to the transcript's tail.
 */
export function anchoredToolCallIds(messages: ReadonlyArray<AnchorMessage>): Set<string> {
  const ids = new Set<string>();
  for (const message of messages) {
    for (const part of message.content ?? []) {
      if (!part || typeof part !== 'object') continue;
      const p = part as { type?: unknown; name?: unknown; data?: unknown };
      if (p.type !== 'data' || p.name !== 'approval') continue;
      const toolCallId = (p.data as { toolCallId?: unknown } | undefined)?.toolCallId;
      if (typeof toolCallId === 'string' && toolCallId) ids.add(toolCallId);
    }
  }
  return ids;
}

/**
 * The approvals the tail section still owns: those with no anchor at all, plus
 * anchored ones whose turn is not on screen (an older page of a paginated
 * thread, or a row written before anchors existed). Rendering an approval twice
 * is worse than rendering it late, so an id present in `anchored` is dropped.
 */
export function tailApprovals(
  approvals: ReadonlyArray<WorkflowApprovalRow>,
  anchored: ReadonlySet<string>,
): WorkflowApprovalRow[] {
  return approvals.filter((a) => !(a.toolCallId && anchored.has(a.toolCallId)));
}
