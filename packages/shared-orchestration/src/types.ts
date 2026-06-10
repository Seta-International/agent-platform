import type {
  AgentMemoryHandle,
  ChatHitlRecorder,
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
  /** Optional recorder for in-thread HITL approval cards (chat inline runs only). */
  recordHitlApproval?: ChatHitlRecorder;
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

/** Events emitted by the inline runner (Task 8), mapped to AI SDK v6 parts by the chat harness (Plan 06). */
export type OrchestrationEvent =
  | { kind: 'step-start'; stepId: string; agentId: string }
  | { kind: 'step-done'; stepId: string; trust: TrustEnvelope }
  | { kind: 'final'; result: unknown };

/** graphile-worker `addJob` signature (injected; the kernel never opens a pool). */
export type AddJob = (
  identifier: string,
  payload?: unknown,
  spec?: { jobKey?: string; maxAttempts?: number; queueName?: string; runAt?: Date },
) => Promise<unknown>;
