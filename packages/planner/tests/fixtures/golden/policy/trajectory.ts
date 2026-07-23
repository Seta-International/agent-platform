// packages/planner/tests/fixtures/golden/policy/trajectory.ts
//
// Source-agnostic observed trajectory. Scorers read ONLY this shape, so they are
// identical whether it comes from Mastra native trace extraction or a SubStepEvent
// extension (the spike decides the source; a later adapter maps into this).
export interface ToolCall {
  agentId: string;
  toolName: string;
  args: unknown;
  result?: unknown;
  ok: boolean;
}

export interface Trajectory {
  toolCalls: ToolCall[];
}

export function toolNames(t: Trajectory): string[] {
  return t.toolCalls.map((c) => c.toolName);
}
