import type { ApprovalCard } from '@seta/agent-sdk';
import type { ChatStreamRun } from '@seta/shared-orchestration';

export interface UiStreamWriter {
  write(chunk: unknown): void;
}

/** A persisted assistant-message part. The streamed `text` prose is the answer;
 *  `data-result` carries the structured payload for cards; `data-trust` carries
 *  confidence + citations. `reasoning` holds `<think>` blocks extracted from
 *  r1-style models so they survive reload and render in the thought span. */
export type OrchestrationAssistantPart =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
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

// Returns how many trailing chars of `s` match a leading prefix of `tag`.
// Used to hold back a partial tag boundary before more data arrives.
function trailingPrefixLen(s: string, tag: string): number {
  for (let len = Math.min(s.length, tag.length - 1); len > 0; len--) {
    if (s.endsWith(tag.slice(0, len))) return len;
  }
  return 0;
}

/**
 * Intercepts text-delta events from r1-style models that embed their thinking
 * as `<think>...</think>` in plain text. Strips those blocks from the text
 * stream and re-emits them as `reasoning-start`/`reasoning-delta`/`reasoning-end`
 * events so the client renders them in the thought span without a page reload.
 *
 * Handles tags split across chunk boundaries via an internal buffer.
 * `push()` returns the non-think text added (for answer accumulation).
 * `flush()` drains any pending buffer at end-of-stream.
 */
class ThinkStreamSplitter {
  private mode: 'text' | 'think' = 'text';
  private buf = '';
  private reasoningId = '';
  readonly thinking: string[] = [];

  constructor(private readonly writer: UiStreamWriter) {}

  push(delta: string): string {
    this.buf += delta;
    let textOut = '';

    while (this.buf.length > 0) {
      if (this.mode === 'text') {
        const tag = '<think>';
        const idx = this.buf.indexOf(tag);
        if (idx !== -1) {
          const before = this.buf.slice(0, idx);
          if (before) {
            this.writer.write({ type: 'text-delta', delta: before });
            textOut += before;
          }
          this.buf = this.buf.slice(idx + tag.length);
          this.reasoningId = crypto.randomUUID();
          this.writer.write({ type: 'reasoning-start', id: this.reasoningId });
          this.mode = 'think';
        } else {
          const hold = trailingPrefixLen(this.buf, tag);
          const safe = this.buf.slice(0, this.buf.length - hold);
          if (safe) {
            this.writer.write({ type: 'text-delta', delta: safe });
            textOut += safe;
          }
          this.buf = this.buf.slice(safe.length);
          break;
        }
      } else {
        const tag = '</think>';
        const idx = this.buf.indexOf(tag);
        if (idx !== -1) {
          const chunk = this.buf.slice(0, idx);
          if (chunk) {
            this.writer.write({ type: 'reasoning-delta', id: this.reasoningId, delta: chunk });
            this.thinking.push(chunk);
          }
          this.writer.write({ type: 'reasoning-end', id: this.reasoningId });
          this.buf = this.buf.slice(idx + tag.length);
          this.mode = 'text';
        } else {
          const hold = trailingPrefixLen(this.buf, tag);
          const safe = this.buf.slice(0, this.buf.length - hold);
          if (safe) {
            this.writer.write({ type: 'reasoning-delta', id: this.reasoningId, delta: safe });
            this.thinking.push(safe);
          }
          this.buf = this.buf.slice(safe.length);
          break;
        }
      }
    }

    return textOut;
  }

  flush(): string {
    if (!this.buf) return '';
    const remaining = this.buf;
    this.buf = '';
    if (this.mode === 'think') {
      // Unclosed <think> block — treat as reasoning.
      this.writer.write({ type: 'reasoning-delta', id: this.reasoningId, delta: remaining });
      this.writer.write({ type: 'reasoning-end', id: this.reasoningId });
      this.thinking.push(remaining);
      return '';
    }
    this.writer.write({ type: 'text-delta', delta: remaining });
    return remaining;
  }
}

/**
 * Pump an AI SDK v6 UIMessage part stream into the writer, accumulating the
 * answer prose for persistence and detecting native HITL suspend.
 *
 * - Every part is written through (live streaming to the client).
 * - `text-delta` parts pass through a `ThinkStreamSplitter`: `<think>` blocks
 *   are emitted as reasoning events; only non-think deltas accumulate in answer.
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
  const splitter = new ThinkStreamSplitter(writer);
  let answer = '';
  let suspend: ApprovalEvent | undefined;
  const timing: DecodeTiming = {};

  for await (const part of parts) {
    if (part.type === 'data-tool-call-suspended') {
      const d = part.data as SuspendData;
      suspend = { card: d.suspendPayload.card, mastraRunId: d.runId, toolCallId: d.toolCallId };
      continue;
    }
    if (part.type === 'text-delta') {
      const now = performance.now();
      if (timing.firstTokenAtMs === undefined) timing.firstTokenAtMs = now;
      timing.lastTokenAtMs = now;
      answer += splitter.push(part.delta ?? part.text ?? '');
    } else {
      writer.write(part);
    }
  }

  answer += splitter.flush();

  // Persist reasoning before answer text so reload order matches stream order.
  const thinkingText = splitter.thinking.join('').trim();
  if (thinkingText) assistantParts.push({ type: 'reasoning', text: thinkingText });
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
