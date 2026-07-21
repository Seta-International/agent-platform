// packages/planner/tests/fixtures/golden/trajectory-collector.ts
//
// Accumulates tool calls captured post-hoc from a real agent run into the flat
// Trajectory type the policy scorers consume. Two tiers are recorded: the
// orchestrator's delegation tools (routing) and each sub-agent's read tools.
// Merged in record order (cross-tier interleave order is not preserved — the
// scorers only need set membership + per-tier partial order).
import type { ToolCall, Trajectory } from './policy/trajectory.ts';

export interface RecordedCall {
  toolName: string;
  args: unknown;
  result?: unknown;
  ok: boolean;
}

export class TrajectoryCollector {
  private readonly calls: ToolCall[] = [];

  record(agentId: string, calls: RecordedCall[]): void {
    for (const c of calls) {
      this.calls.push({ agentId, toolName: c.toolName, args: c.args, result: c.result, ok: c.ok });
    }
  }

  toTrajectory(): Trajectory {
    return { toolCalls: [...this.calls] };
  }
}
