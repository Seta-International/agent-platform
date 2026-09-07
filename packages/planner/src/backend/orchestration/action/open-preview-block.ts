import type { ActionOpenPreview } from './schemas.ts';

/**
 * The OPEN PREVIEW block A2 reads before deciding whether a sentence adjusts the
 * proposal already on screen (FUT-840).
 *
 * Injected as authoritative data, not as chat history: the approval id here is
 * the one the tool compares the model's `revisionOf` against (design D15), so it
 * has to come from the server on this turn rather than be recalled from a
 * transcript the model may have compacted.
 *
 * The rows are the CARD's own, so this renders the complete proposal rather than a
 * summary — assignee sets included and already resolved to names. That matters
 * for one case in particular: "thêm Tuấn nữa" has to be unioned against the
 * PROPOSED set, not against the task's stored set, and the model can only do that
 * if it can read what was proposed.
 */
export function renderOpenPreviewBlock(openPreview: ActionOpenPreview): string {
  const lines = [
    'OPEN PREVIEW (waiting for the user to confirm or cancel it):',
    `  approvalId: ${openPreview.approvalId}`,
    `  tool: ${openPreview.toolId}`,
    `  what it says: ${openPreview.intent}`,
  ];
  if (openPreview.proposedRows.length > 0) {
    lines.push('  proposed:');
    for (const row of openPreview.proposedRows) {
      lines.push(`    ${row.k}: ${row.v}`);
    }
  }
  return lines.join('\n');
}
