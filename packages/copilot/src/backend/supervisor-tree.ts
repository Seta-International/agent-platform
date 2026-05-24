import { Agent } from '@mastra/core/agent';
import { CopilotRegistry, type Domain, type SpecialistSpec } from '@seta/copilot-sdk';
import { resolveModel } from './model-registry.ts';
import { generateDomainPrompt, generateTopRoutingPrompt } from './prompt-templates.ts';

function buildSpecialistAgent(spec: SpecialistSpec): Agent {
  return new Agent({
    id: `${spec.domain}-${spec.id}`,
    name: spec.id,
    description: spec.description,
    instructions: spec.instructions as never,
    model: resolveModel('auto', { tierHint: 'fast' }).model as never,
    tools: spec.tools as never,
    workflows: (spec.workflows ?? {}) as never,
  });
}

function buildDomainSupervisor(domain: Domain): Agent {
  const snapshot = CopilotRegistry.snapshot();
  const specialists = snapshot.specialists.filter((s) => s.domain === domain);
  const workflows = snapshot.workflows.filter((w) => w.domain === domain);
  const agents: Record<string, Agent> = {};
  for (const s of specialists) agents[s.id] = buildSpecialistAgent(s);
  const wfMap: Record<string, unknown> = {};
  for (const w of workflows) wfMap[w.id] = w.workflow;
  return new Agent({
    id: `${domain}-supervisor`,
    name: `${domain}-supervisor`,
    description: `Coordinates ${domain} specialists and workflows`,
    instructions: generateDomainPrompt(domain, snapshot),
    model: resolveModel('auto', { tierHint: 'balanced' }).model as never,
    agents: agents as never,
    workflows: wfMap as never,
  });
}

export function buildSupervisorTree(): Agent {
  const snapshot = CopilotRegistry.snapshot();
  const domainAgents: Record<string, Agent> = {};
  for (const d of snapshot.domains) domainAgents[d] = buildDomainSupervisor(d as Domain);
  return new Agent({
    id: 'top-supervisor',
    name: 'Supervisor',
    description: 'Top-level router. Routes every request to one domain.',
    instructions: generateTopRoutingPrompt(snapshot),
    model: resolveModel('auto', { tierHint: 'balanced' }).model as never,
    agents: domainAgents as never,
  });
}
