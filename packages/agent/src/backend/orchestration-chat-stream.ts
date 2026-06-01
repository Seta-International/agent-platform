import type { OrchestrationEvent } from '@seta/shared-orchestration';

export interface UiStreamWriter {
  write(chunk: unknown): void;
}

interface Recommendation {
  userId: string;
  name: string | null;
  skillMatch: string[];
  skillMatchCount: number;
  status: string;
}

function formatFinal(result: unknown): string {
  const r = result as {
    actionable?: boolean;
    message?: string;
    recommendations?: Recommendation[];
  };
  if (r && r.actionable === false) {
    return `\n${r.message ?? 'Nothing to recommend.'}\n`;
  }
  const recs = r?.recommendations ?? [];
  if (recs.length === 0) return '\nNo suitable candidates found.\n';
  const lines = recs
    .slice(0, 5)
    .map(
      (x, i) =>
        `${i + 1}. ${x.name ?? x.userId} — skills:${x.skillMatchCount} (${x.skillMatch.join(', ')}) · ${x.status}`,
    );
  // Trust metadata is dumped as text in the harness (no dedicated UI yet).
  return `\nRecommended assignees:\n${lines.join('\n')}\n`;
}

/**
 * Maps an orchestration event stream onto AI SDK v6 UI text-stream chunks.
 * Pure: the caller provides the writer (the route wraps a createUIMessageStream
 * writer; tests pass a fake). See Task 2 Step 0 for the chunk-shape contract.
 */
export async function streamOrchestrationToUI(
  writer: UiStreamWriter,
  events: AsyncIterable<OrchestrationEvent>,
  opts: { textId?: string } = {},
): Promise<void> {
  const id = opts.textId ?? 'orchestration';
  writer.write({ type: 'text-start', id });
  let finalResult: unknown;
  for await (const ev of events) {
    if (ev.kind === 'step-start') {
      writer.write({ type: 'text-delta', id, delta: `\n▸ ${ev.stepId} (${ev.agentId})…\n` });
    } else if (ev.kind === 'step-done') {
      writer.write({
        type: 'text-delta',
        id,
        delta: `   ↳ trust conf=${ev.trust.confidenceScore.toFixed(2)} · ${ev.trust.evidenceCitations.length} citations\n`,
      });
    } else if (ev.kind === 'final') {
      finalResult = ev.result;
    }
  }
  writer.write({ type: 'text-delta', id, delta: formatFinal(finalResult) });
  writer.write({ type: 'text-end', id });
}
