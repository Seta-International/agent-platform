import type { TrustEnvelope } from '@seta/agent-sdk';
import type { RunRecord, RunStateRepository, RunStatus } from '../../src/repository.ts';

interface StoredRun extends RunRecord {
  result?: unknown;
  error?: string;
}

export class InMemoryRunStateRepository implements RunStateRepository {
  private runs = new Map<string, StoredRun>();
  public traces: { runId: string; stepId: string; agentId: string; trust: TrustEnvelope }[] = [];

  async createRun(run: {
    runId: string;
    orchestrationId: string;
    tenantId: string;
    actorUserId: string;
    input: unknown;
  }): Promise<void> {
    this.runs.set(run.runId, {
      status: 'running',
      input: run.input,
      state: { runId: run.runId, orchestrationId: run.orchestrationId, outputs: {} },
    });
  }

  async loadRun(runId: string): Promise<RunRecord> {
    const r = this.runs.get(runId);
    if (!r) throw new Error(`run ${runId} not found`);
    // Return a deep-ish copy so callers mutating state don't corrupt the store between loads.
    return {
      status: r.status,
      input: r.input,
      state: { ...r.state, outputs: { ...r.state.outputs } },
    };
  }

  async saveStep(args: {
    runId: string;
    stepId: string;
    agentId: string;
    output: unknown;
    trust: TrustEnvelope;
  }): Promise<void> {
    const r = this.runs.get(args.runId);
    if (!r) throw new Error(`run ${args.runId} not found`);
    if (args.stepId in r.state.outputs) return; // idempotent
    r.state.outputs[args.stepId] = args.output;
    this.traces.push({
      runId: args.runId,
      stepId: args.stepId,
      agentId: args.agentId,
      trust: args.trust,
    });
  }

  async completeRun(runId: string, result: unknown): Promise<void> {
    this.setStatus(runId, 'completed');
    this.runs.get(runId)!.result = result;
  }

  async failRun(runId: string, error: string): Promise<void> {
    this.setStatus(runId, 'failed');
    this.runs.get(runId)!.error = error;
  }

  private setStatus(runId: string, status: RunStatus): void {
    const r = this.runs.get(runId);
    if (!r) throw new Error(`run ${runId} not found`);
    r.status = status;
  }
}
