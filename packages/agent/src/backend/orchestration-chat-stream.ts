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

interface TaskSummary {
  taskId: string;
  title: string;
  status: string;
  skillTags: string[];
}

function formatFinal(result: unknown): string {
  const r = result as {
    actionable?: boolean;
    message?: string;
    recommendations?: Recommendation[];
    tasks?: TaskSummary[];
  };
  // find_tasks (terminal) result: a task list (possibly empty). Checked first —
  // only this branch carries a `tasks` array; recommend results never do.
  if (r && Array.isArray(r.tasks)) {
    if (r.tasks.length === 0) return '\nNo matching tasks found.\n';
    const lines = r.tasks
      .slice(0, 20)
      .map(
        (t, i) =>
          `${i + 1}. ${t.title} [${t.status}] — tags: ${t.skillTags.join(', ') || '(none)'}`,
      );
    return `\nTasks:\n${lines.join('\n')}\n`;
  }
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

/** A persisted assistant-message part. Mirrors the shape the read path
 *  (`mastraPartToUIPart` in routes.ts) reconstructs and the frontend renders:
 *  one `data-orchestration-step` card per step, then the final answer text. */
export type OrchestrationAssistantPart =
  | {
      type: `data-${typeof ORCHESTRATION_STEP_PART}`;
      id: string;
      data: { stepId: string; agentId?: string; status: 'done'; trust: unknown };
    }
  | { type: 'text'; text: string };

/**
 * Maps an orchestration event stream onto AI SDK v6 UI stream chunks. Each step
 * is surfaced as a reconciled `data-orchestration-step` part carrying the full
 * TrustEnvelope (reasoning trace + citations + confidence) for the trace UI; the
 * final answer follows as one text part. Pure: the caller provides the writer
 * (the route wraps a createUIMessageStream writer; tests pass a fake).
 *
 * Returns the assistant-message parts (one done-card per step + the final text)
 * so the caller can persist the turn to Mastra memory — without persistence the
 * AUI remote-thread-list reconciles against an empty server and the streamed
 * conversation "reloads and disappears" the moment it refreshes its thread list.
 */
export async function streamOrchestrationToUI(
  writer: UiStreamWriter,
  events: AsyncIterable<OrchestrationEvent>,
  opts: { textId?: string } = {},
): Promise<{ assistantParts: OrchestrationAssistantPart[] }> {
  const id = opts.textId ?? 'orchestration';
  // step-done carries no agentId; remember it from step-start so the done card
  // keeps the agent label.
  const agentByStep = new Map<string, string>();
  const assistantParts: OrchestrationAssistantPart[] = [];
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
      const data = {
        stepId: ev.stepId,
        agentId: agentByStep.get(ev.stepId),
        status: 'done' as const,
        trust: ev.trust,
      };
      writer.write({ type: `data-${ORCHESTRATION_STEP_PART}`, id: ev.stepId, data });
      assistantParts.push({ type: `data-${ORCHESTRATION_STEP_PART}`, id: ev.stepId, data });
    } else if (ev.kind === 'final') {
      finalResult = ev.result;
    }
  }
  // The answer text part follows the timeline cards.
  const finalText = formatFinal(finalResult);
  writer.write({ type: 'text-start', id });
  writer.write({ type: 'text-delta', id, delta: finalText });
  writer.write({ type: 'text-end', id });
  assistantParts.push({ type: 'text', text: finalText });
  return { assistantParts };
}
