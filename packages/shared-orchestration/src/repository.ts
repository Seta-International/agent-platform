import type { TrustEnvelope } from '@seta/agent-sdk';
import type { RunState } from './types.ts';

export type RunStatus = 'running' | 'completed' | 'failed' | 'canceled';

export interface RunRecord {
  status: RunStatus;
  input: unknown;
  state: RunState;
}

/**
 * Persistence boundary for orchestration runs. Implemented by the caller
 * (Plan 03, staffing) so the kernel never imports a module or opens a pool.
 * The implementation owns the transaction and any audit-event emission.
 */
export interface RunStateRepository {
  createRun(run: {
    runId: string;
    orchestrationId: string;
    tenantId: string;
    actorUserId: string;
    input: unknown;
  }): Promise<void>;
  loadRun(runId: string): Promise<RunRecord>;
  /** Upsert idempotent on (runId, stepId): record the step output + trust, and merge output into run state. */
  saveStep(args: {
    runId: string;
    stepId: string;
    agentId: string;
    output: unknown;
    trust: TrustEnvelope;
  }): Promise<void>;
  completeRun(runId: string, result: unknown): Promise<void>;
  failRun(runId: string, error: string): Promise<void>;
}
