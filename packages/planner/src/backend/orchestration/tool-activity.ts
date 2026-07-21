// Tier-agnostic tool-activity capture for the planner Q&A agents.
//
// Mastra's `agent.generate()` resolves to a `FullOutput` whose `toolCalls` /
// `toolResults` are chunk arrays (`{ payload: { toolCallId, toolName, args } }`
// and `{ payload: { toolCallId, result, isError } }`). The orchestrator and its
// sub-agents discard those today. This module flattens them into a stable,
// framework-independent shape and exposes an optional `onToolActivity` callback
// so an eval harness can observe the executed trajectory. Absent callback ⇒ no
// behavior change.

export interface ToolActivity {
  toolName: string;
  args: unknown;
  result?: unknown;
  ok: boolean;
}

export type OnToolActivity = (calls: ToolActivity[]) => void;

interface RawToolCall {
  payload?: { toolCallId?: string; toolName?: string; args?: unknown };
}
interface RawToolResult {
  payload?: { toolCallId?: string; result?: unknown; isError?: boolean };
}

/** Flatten Mastra tool-call/tool-result chunks, matching results to calls by id. */
export function mapToolActivity(
  toolCalls: RawToolCall[] = [],
  toolResults: RawToolResult[] = [],
): ToolActivity[] {
  const resultById = new Map<string, RawToolResult['payload']>();
  for (const tr of toolResults) {
    if (tr.payload?.toolCallId) resultById.set(tr.payload.toolCallId, tr.payload);
  }
  return toolCalls.map((tc) => {
    const p = tc.payload ?? {};
    const res = p.toolCallId ? resultById.get(p.toolCallId) : undefined;
    const activity: ToolActivity = {
      toolName: p.toolName ?? 'unknown',
      args: p.args,
      ok: res ? !res.isError : true,
    };
    if (res && 'result' in res) activity.result = res.result;
    return activity;
  });
}
