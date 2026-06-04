import type { Citation, TrustEnvelope } from '@seta/agent-sdk';

export interface MastraToolSignals {
  toolCalls: { payload: { toolName: string; args?: unknown } }[];
  toolResults: { payload: { toolName: string; result: unknown } }[];
  /** The LLM's final turn text — assemble's message for no-tool (ack) turns. */
  text?: string;
}

export interface TrustFromResultOpts {
  /** Map each tool RESULT chunk to citations (e.g. the users it returned). */
  citations: (toolResult: { payload: { toolName: string; result: unknown } }) => Citation[];
  /** Confidence 0..1 computed by the caller from real signals. */
  confidence: number;
}

/** Build a TrustEnvelope from a Mastra generate() result. reasoningTrace = tool
 *  calls the LLM made; evidenceCitations = caller-mapped from tool results. The
 *  LLM never self-scores. */
export function trustFromMastraResult(
  res: MastraToolSignals,
  opts: TrustFromResultOpts,
): TrustEnvelope {
  const at = new Date().toISOString();
  return {
    reasoningTrace: res.toolCalls.map((tc) => ({
      step: tc.payload.toolName,
      detail: `args=${JSON.stringify(tc.payload.args ?? {})}`,
      at,
    })),
    evidenceCitations: res.toolResults.flatMap((tr) => opts.citations(tr)),
    confidenceScore: Math.max(0, Math.min(1, opts.confidence)),
  };
}
