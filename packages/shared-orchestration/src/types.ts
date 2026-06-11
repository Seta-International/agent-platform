import type { MastraModelOutput } from '@mastra/core/stream';
import type {
  AgentMemoryHandle,
  ApprovalCard,
  SpecializedAgentRunCtx,
  TrustEnvelope,
} from '@seta/agent-sdk';
import { z } from 'zod';

/** Tenant/actor context for a run. */
export interface RunCtx {
  tenantId: string;
  actorUserId: string;
  /** Resolved permission set for the actor — forwarded into each agent's run
   *  ctx so cross-module read tools enforce access. Empty for queued runs. */
  effectivePermissions?: ReadonlySet<string>;
  /** The real chat thread id (chat inline runs only). */
  threadId?: string;
  /** Thread-scoped conversation-entities memory handle (chat inline runs only). */
  entitiesMemory?: AgentMemoryHandle;
  /** Resource-scoped userContext memory handle (chat inline runs only). */
  userMemory?: AgentMemoryHandle;
  /** Per-turn model override (chat inline runs only) — forwarded into each
   *  agent's run ctx; see SpecializedAgentRunCtx.model. */
  model?: SpecializedAgentRunCtx['model'];
}

/** Accumulated state of a run: each completed step's output keyed by step id. */
export interface RunState {
  runId: string;
  orchestrationId: string;
  outputs: Record<string, unknown>;
}

/** One node in an orchestration. `input` maps accumulated state (+ original run input) to this agent's input. */
export interface OrchestrationStep {
  id: string;
  agentId: string;
  input: (state: RunState, runInput: unknown) => unknown;
}

/** A declarative, deterministic orchestration (linear in v1). */
export interface OrchestrationSpec {
  id: string;
  steps: OrchestrationStep[];
  /** Maps a run to a graphile-worker queue name; runs sharing a key execute serially. */
  serializationKey: (runInput: unknown, ctx: RunCtx) => string;
  /** Called once when the run finishes (normal or early-exit). */
  onComplete: (final: RunState, ctx: RunCtx) => Promise<void>;
}

/** Payload of the `orchestration:run_step` job. */
export const RunStepPayloadSchema = z.object({
  runId: z.string().min(1),
  orchestrationId: z.string().min(1),
  stepIndex: z.number().int().min(0),
  tenantId: z.string().min(1),
  actorUserId: z.string().min(1),
});
export type RunStepPayload = z.infer<typeof RunStepPayloadSchema>;

/** The assembled, structured outcome of a completed (non-suspended) chat turn:
 *  the orchestrator's domain result plus the derived trust envelope. */
export interface OrchestrationFinal {
  result: unknown;
  trust: TrustEnvelope;
}

/** One chat turn driven natively. `output` is the live Mastra stream the route
 *  converts to AI SDK v6 UIMessage parts; `finalize` awaits the run's tool
 *  results and assembles the structured result + trust (called only when the
 *  turn completes without suspending — a suspended turn has no result). */
export interface ChatStreamRun {
  output: MastraModelOutput<unknown>;
  finalize: () => Promise<OrchestrationFinal>;
}

/** Events emitted by the inline/evented orchestration runner (`runOrchestrationInline`,
 *  the declarative step-DAG path). The native chat path uses `ChatStreamRun` instead;
 *  this union is retained for the inline runner and is out of scope for the chat
 *  streaming-backbone migration. */
export type OrchestrationEvent =
  | { kind: 'step-start'; stepId: string; agentId: string }
  | { kind: 'step-done'; stepId: string; trust: TrustEnvelope }
  | { kind: 'text'; text: string }
  | { kind: 'approval'; card: ApprovalCard; mastraRunId: string; toolCallId: string }
  | { kind: 'final'; result: unknown };

/** graphile-worker `addJob` signature (injected; the kernel never opens a pool). */
export type AddJob = (
  identifier: string,
  payload?: unknown,
  spec?: { jobKey?: string; maxAttempts?: number; queueName?: string; runAt?: Date },
) => Promise<unknown>;
