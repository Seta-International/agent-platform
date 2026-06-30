import type { ApprovalCard } from '@seta/agent-sdk';
import type { ChatStreamRun } from '@seta/shared-orchestration';

export interface UiStreamWriter {
  write(chunk: unknown): void;
}

/** A persisted assistant-message part. The streamed `text` prose is the answer;
 *  `data-result` carries the structured payload for cards; `data-trust` carries
 *  confidence + citations. */
export type OrchestrationAssistantPart =
  | { type: 'text'; text: string }
  | { type: 'data-result'; id: 'result'; data: unknown }
  | { type: 'data-trust'; id: 'trust'; data: unknown };

/** The suspend signal as it survives `@mastra/ai-sdk` conversion: a data part
 *  carrying the run id, tool-call id, and the tool's suspend payload (our card). */
interface SuspendData {
  runId: string;
  toolCallId: string;
  suspendPayload: { card: ApprovalCard };
}

export interface ApprovalEvent {
  card: ApprovalCard;
  mastraRunId: string;
  toolCallId: string;
}

/** Decode-window timestamps (`performance.now()` ms) for tok/s measurement:
 *  when the first and last streamed text deltas were observed. Both undefined
 *  when the turn produced no prose (e.g. a pure suspend or tool-only turn). */
export interface DecodeTiming {
  firstTokenAtMs?: number;
  lastTokenAtMs?: number;
}

/**
 * Pump an AI SDK v6 UIMessage part stream into the writer, accumulating the
 * answer prose for persistence and detecting native HITL suspend.
 *
 * - Every part is written through (live streaming to the client).
 * - `text-delta` parts accumulate into the persisted answer text.
 * - A `data-tool-call-suspended` part means the run paused for approval: the
 *   `onApproval` hook fires (writes the read-model row) and `finalize` is NOT
 *   called (a suspended turn has no assembled result).
 * - On normal completion, `finalize()` produces the structured result + trust,
 *   written as reconciled `data-result` / `data-trust` cards.
 */
export async function pumpOrchestrationStream(
  writer: UiStreamWriter,
  parts: AsyncIterable<{ type: string; delta?: string; text?: string; data?: unknown }>,
  opts: {
    finalize: ChatStreamRun['finalize'];
    onApproval: (e: ApprovalEvent) => Promise<void>;
  },
): Promise<{ assistantParts: OrchestrationAssistantPart[]; timing: DecodeTiming }> {
  const assistantParts: OrchestrationAssistantPart[] = [];
  let answer = '';
  let suspend: ApprovalEvent | undefined;
  const timing: DecodeTiming = {};

  for await (const part of parts) {
    if (part.type === 'data-tool-call-suspended') {
      const d = part.data as SuspendData;
      suspend = { card: d.suspendPayload.card, mastraRunId: d.runId, toolCallId: d.toolCallId };
      continue;
    }
    writer.write(part);
    if (part.type === 'text-delta') {
      const now = performance.now();
      if (timing.firstTokenAtMs === undefined) timing.firstTokenAtMs = now;
      timing.lastTokenAtMs = now;
      answer += part.delta ?? part.text ?? '';
    }
  }

  if (answer) assistantParts.push({ type: 'text', text: answer });

  if (suspend) {
    await opts.onApproval(suspend);
    return { assistantParts, timing };
  }

  const { result, trust } = await opts.finalize();
  writer.write({ type: 'data-result', id: 'result', data: result });
  writer.write({ type: 'data-trust', id: 'trust', data: trust });
  assistantParts.push({ type: 'data-result', id: 'result', data: result });
  assistantParts.push({ type: 'data-trust', id: 'trust', data: trust });
  return { assistantParts, timing };
}
