import type { ActionOpenPreview } from './schemas.ts';

/**
 * The OPEN PREVIEW block A2 reads before deciding whether a sentence adjusts the
 * proposal already on screen (FUT-840).
 *
 * Injected as authoritative data, not as chat history: it has to come from the
 * server on this turn rather than be recalled from a transcript the model may
 * have compacted.
 *
 * The card's IDENTITY is deliberately absent. The server decides which proposal a
 * turn adjusts (design D20), so no tool argument can carry an approval id — and
 * printing one gave the model 36 characters whose only observed use was narrating
 * that it would cancel or replace "that approval", which it has no tool for and
 * which the writer already does atomically. `ActionOpenPreview.approvalId` stays
 * on the DTO; it is for the server's own load and supersede, not for the prompt.
 *
 * The rows are the CARD's own, so this renders the complete proposal rather than a
 * summary — assignee sets included and already resolved to names. That matters
 * for one case in particular: "thêm Tuấn nữa" has to be unioned against the
 * PROPOSED set, not against the task's stored set, and the model can only do that
 * if it can read what was proposed.
 */
export function renderOpenPreviewBlock(openPreview: ActionOpenPreview): string {
  const lines = [
    'OPEN PREVIEW (waiting for the user to confirm or cancel it — only they can):',
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
