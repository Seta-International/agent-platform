import type { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { CopilotRegistry, type Domain, type SpecialistSpec } from '@seta/copilot-sdk';
import { resolveModel } from './model-registry.ts';
import { generateDomainPrompt, generateTopRoutingPrompt } from './prompt-templates.ts';

function buildMemory(mastra: Mastra | undefined): Memory | undefined {
  const storage = mastra?.getStorage();
  if (!storage) return undefined;
  return new Memory({
    storage: storage as never,
    options: { semanticRecall: false, generateTitle: true },
  });
}

function buildSpecialistAgent(spec: SpecialistSpec, memory: Memory | undefined): Agent {
  return new Agent({
    id: `${spec.domain}-${spec.id}`,
    name: spec.id,
    description: spec.description,
    instructions: spec.instructions as never,
    model: resolveModel('auto', { tierHint: 'fast' }).model as never,
    tools: spec.tools as never,
    workflows: (spec.workflows ?? {}) as never,
    ...(memory ? { memory } : {}),
  });
}

function buildDomainSupervisor(domain: Domain, memory: Memory | undefined): Agent {
  const snapshot = CopilotRegistry.snapshot();
  const specialists = snapshot.specialists.filter((s) => s.domain === domain);
  const agents: Record<string, Agent> = {};
  for (const s of specialists) agents[s.id] = buildSpecialistAgent(s, memory);
  return new Agent({
    id: `${domain}-supervisor`,
    name: `${domain}-supervisor`,
    description: `Coordinates ${domain} specialists`,
    instructions: generateDomainPrompt(domain, snapshot),
    model: resolveModel('auto', { tierHint: 'balanced' }).model as never,
    agents: agents as never,
    ...(memory ? { memory } : {}),
  });
}

export function buildSupervisorTree(opts: { mastra?: Mastra } = {}): Agent {
  const snapshot = CopilotRegistry.snapshot();
  const memory = buildMemory(opts.mastra);
  const domainAgents: Record<string, Agent> = {};
  for (const d of snapshot.domains) domainAgents[d] = buildDomainSupervisor(d as Domain, memory);
  return new Agent({
    id: 'top-supervisor',
    name: 'Supervisor',
    description: 'Top-level router. Routes every request to one domain.',
    instructions: generateTopRoutingPrompt(snapshot),
    model: resolveModel('auto', { tierHint: 'balanced' }).model as never,
    agents: domainAgents as never,
    ...(memory ? { memory } : {}),
  });
}
