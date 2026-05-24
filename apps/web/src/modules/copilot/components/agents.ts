export type AgentName = string;

export interface AgentOption {
  name: AgentName;
  label: string;
  description: string;
  delegates?: ReadonlyArray<string>;
}

export const FALLBACK_AGENTS: ReadonlyArray<AgentOption> = [
  { name: 'self', label: 'Self', description: 'Answers questions about you and your work' },
  { name: 'supervisor', label: 'Supervisor', description: 'Hands off to the right specialist' },
];

export function agentLabel(name: AgentName, options: ReadonlyArray<AgentOption>): string {
  return options.find((a) => a.name === name)?.label ?? name;
}
