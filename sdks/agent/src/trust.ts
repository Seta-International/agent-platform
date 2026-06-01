import { z } from 'zod';

/** One entry in an agent's reasoning trace. Ids/scores/short descriptions only — never raw content or secrets. */
export const TraceEntrySchema = z.object({
  step: z.string().min(1),
  detail: z.string(),
  at: z.string(), // ISO-8601 timestamp; stamped by the agent
});
export type TraceEntry = z.infer<typeof TraceEntrySchema>;

/** A pointer to evidence the agent relied on. */
export const CitationSchema = z.object({
  kind: z.enum(['task', 'user', 'doc', 'embedding']),
  id: z.string().min(1),
  label: z.string().optional(),
  score: z.number().optional(), // similarity / relevance when available
});
export type Citation = z.infer<typeof CitationSchema>;

/** Trust metadata attached to every specialized-agent output. */
export const TrustEnvelopeSchema = z.object({
  reasoningTrace: z.array(TraceEntrySchema),
  evidenceCitations: z.array(CitationSchema),
  confidenceScore: z.number().min(0).max(1),
});
export type TrustEnvelope = z.infer<typeof TrustEnvelopeSchema>;

export const EMPTY_TRUST: TrustEnvelope = {
  reasoningTrace: [],
  evidenceCitations: [],
  confidenceScore: 0,
};

/**
 * The return shape of a specialized agent's `run`.
 * `terminal: true` tells the orchestration kernel to stop the run early and
 * use this `result` as the final result (used by the self-gating analyzer in
 * the chat harness, and later by the Hybrid orchestrator to skip stages).
 */
export interface AgentResult<O> {
  result: O;
  trust: TrustEnvelope;
  terminal?: boolean;
}
