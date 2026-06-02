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
  return `\nRecommended assignees:\n${lines.join('\n')}\n`;
}

/** Wire name of the per-step trace data part the frontend renders as a timeline
 *  card. Reconciled by `id` (the stepId), so the running→done writes update one
 *  card instead of appending. Frontend: useAssistantDataUI({ name }) reads it as
 *  `{ type:'data', name:'orchestration-step', data }`. */
export const ORCHESTRATION_STEP_PART = 'orchestration-step' as const;

/**
 * Maps an orchestration event stream onto AI SDK v6 UI stream chunks. Each step
 * is surfaced as a reconciled `data-orchestration-step` part carrying the full
 * TrustEnvelope (reasoning trace + citations + confidence) for the trace UI; the
 * final answer follows as one text part. Pure: the caller provides the writer
 * (the route wraps a createUIMessageStream writer; tests pass a fake).
 */
export async function streamOrchestrationToUI(
  writer: UiStreamWriter,
  events: AsyncIterable<OrchestrationEvent>,
  opts: { textId?: string } = {},
): Promise<void> {
  const id = opts.textId ?? 'orchestration';
  // step-done carries no agentId; remember it from step-start so the done card
  // keeps the agent label.
  const agentByStep = new Map<string, string>();
  let finalResult: unknown;
  for await (const ev of events) {
    if (ev.kind === 'step-start') {
      agentByStep.set(ev.stepId, ev.agentId);
      writer.write({
        type: `data-${ORCHESTRATION_STEP_PART}`,
        id: ev.stepId,
        data: { stepId: ev.stepId, agentId: ev.agentId, status: 'running' },
      });
    } else if (ev.kind === 'step-done') {
      writer.write({
        type: `data-${ORCHESTRATION_STEP_PART}`,
        id: ev.stepId,
        data: {
          stepId: ev.stepId,
          agentId: agentByStep.get(ev.stepId),
          status: 'done',
          trust: ev.trust,
        },
      });
    } else if (ev.kind === 'final') {
      finalResult = ev.result;
    }
  }
  // The answer text part follows the timeline cards.
  writer.write({ type: 'text-start', id });
  writer.write({ type: 'text-delta', id, delta: formatFinal(finalResult) });
  writer.write({ type: 'text-end', id });
}
