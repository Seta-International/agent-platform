import type { ModelTier } from '../model-registry.ts';
import type { CopilotTool } from '../tools/_types.ts';

export interface AgentSpec {
  name: string;
  label: string;
  description: string;
  instructions: string;
  tools: ReadonlyArray<CopilotTool>;
  delegates?: ReadonlyArray<string>;
  defaultTier?: ModelTier;
  /**
   * Whether end-users can pick this agent from the catalog. Defaults to true.
   * Use false for routing-only agents that should stay wired in code (so other
   * agents can reference them via `delegates`) but never appear in the selector.
   */
  userVisible?: boolean;
}

export type AgentSpecs = ReadonlyArray<AgentSpec>;

export function listAgentNames(specs: AgentSpecs): string[] {
  return specs.map((s) => s.name);
}

export function findSpec(specs: AgentSpecs, name: string): AgentSpec | undefined {
  return specs.find((s) => s.name === name);
}
