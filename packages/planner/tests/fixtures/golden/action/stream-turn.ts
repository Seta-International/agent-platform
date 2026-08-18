// packages/planner/tests/fixtures/golden/action/stream-turn.ts
//
// Drains ONE A2 turn and reduces it to everything a scorer needs.
//
// Chunk field paths are the ones pinned against the real Mastra runtime by
// tests/integration/orchestration/assignment/suspend-characterization.test.ts:
// `chunk.runId`, `chunk.payload.toolCallId`, `chunk.payload.suspendPayload`, and
// a tool result's value at `chunk.payload.result` (NOT `.output`).
//
// A suspended run emits NO `finish` chunk and its `await stream.text` is `''`, so
// the narration must be accumulated from `text-delta` rather than awaited.
// `args` is read as `payload.args ?? payload.input` because the model-facing part
// and the runtime chunk have historically differed on that name; the integration
// characterization test in this same wave asserts which one actually carried it.
import type { ChatStreamRun } from '@seta/shared-orchestration';
import type { RecordedCall } from '../trajectory-collector.ts';

export interface ActionTurnOutcome {
  answer: string;
  toolCalls: RecordedCall[];
  suspended: boolean;
  /** The approval card the tool suspended with (`suspendPayload.card`). */
  card?: Record<string, unknown>;
  /** The rendered revision diff, when the tool produced one (`suspendPayload.revised`). */
  revised?: unknown;
  mastraRunId?: string;
  toolCallId?: string;
  finishReason?: string;
  /** Every chunk type seen, in order — diagnostic for a case that behaved oddly. */
  chunkTypes: string[];
}

type Chunk = {
  type: string;
  runId?: string;
  payload?: {
    toolCallId?: string;
    toolName?: string;
    args?: unknown;
    input?: unknown;
    result?: unknown;
    text?: string;
    suspendPayload?: { card?: Record<string, unknown>; revised?: unknown };
  };
  /** `text-delta` has also been observed carrying its text at the top level. */
  delta?: string;
};

/** True when a tool result observably failed: a graceful `{ error: "…" }`. */
function failed(result: unknown): boolean {
  return (
    typeof result === 'object' &&
    result !== null &&
    typeof (result as { error?: unknown }).error === 'string' &&
    (result as { error: string }).error.length > 0
  );
}

export async function drainActionTurn(run: ChatStreamRun): Promise<ActionTurnOutcome> {
  const stream = run.output as unknown as {
    fullStream: AsyncIterable<Chunk>;
    text: Promise<string | undefined>;
    finishReason: Promise<string | undefined>;
  };

  const byCallId = new Map<string, RecordedCall>();
  const order: string[] = [];
  const chunkTypes: string[] = [];
  let narration = '';
  const outcome: ActionTurnOutcome = { answer: '', toolCalls: [], suspended: false, chunkTypes };

  const remember = (callId: string, p: NonNullable<Chunk['payload']>): void => {
    if (byCallId.has(callId)) return;
    byCallId.set(callId, {
      toolName: p.toolName ?? 'unknown',
      args: p.args ?? p.input ?? {},
      result: undefined,
      ok: true,
    });
    order.push(callId);
  };

  for await (const chunk of stream.fullStream) {
    chunkTypes.push(chunk.type);
    const p = chunk.payload ?? {};
    const callId = p.toolCallId ?? `#${order.length}`;

    switch (chunk.type) {
      case 'text-delta':
        narration += p.text ?? chunk.delta ?? '';
        break;
      case 'tool-call':
        remember(callId, p);
        break;
      case 'tool-result': {
        remember(callId, p);
        const call = byCallId.get(callId)!;
        call.result = p.result;
        call.ok = !failed(p.result);
        break;
      }
      case 'tool-call-suspended':
        outcome.suspended = true;
        outcome.mastraRunId = chunk.runId;
        outcome.toolCallId = p.toolCallId;
        outcome.card = p.suspendPayload?.card;
        outcome.revised = p.suspendPayload?.revised;
        remember(callId, p);
        break;
      default:
        break;
    }
  }

  outcome.finishReason = await stream.finishReason;
  outcome.answer = (outcome.suspended ? narration : ((await stream.text) ?? narration)).trim();
  outcome.toolCalls = order.map((id) => byCallId.get(id)!);
  return outcome;
}
