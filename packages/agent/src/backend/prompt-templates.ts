import type { AgentRegistry, Domain } from '@seta/agent-sdk';

type Snapshot = ReturnType<typeof AgentRegistry.snapshot>;

const DOMAIN_LABEL: Record<Domain, string> = {
  work: 'Work',
  people: 'People',
  self: 'Self',
  meta: 'Meta',
  knowledge: 'Knowledge',
};

const DOMAIN_BLURB: Record<Domain, string> = {
  work: 'Tasks, plans, projects, deliverables, time tracking',
  people: 'Users, roles, permissions, org structure',
  self: 'Current user profile, preferences, notifications',
  meta: 'About this assistant: capabilities, status, settings',
  knowledge:
    'Company documents, policies, handbooks, internal knowledge base — search uploaded files by semantic similarity',
};

export function generateTopRoutingPrompt(snapshot: Snapshot): string {
  const lines = ['You route every request to exactly one domain. Available domains:'];
  for (const d of snapshot.domains) {
    lines.push(`- ${DOMAIN_LABEL[d as Domain]}: ${DOMAIN_BLURB[d as Domain]}`);
  }
  lines.push(
    '',
    'Delegate to the matching domain agent. If the request spans multiple domains, ' +
      "pick the one most central to the user's intent and let it pull cross-module reads.",
    'Never answer directly — always delegate.',
  );
  return lines.join('\n');
}

export function generateDomainPrompt(domain: Domain, snapshot: Snapshot): string {
  const specs = snapshot.specialists.filter((s) => s.domain === domain);
  const lines = [
    `You coordinate ${DOMAIN_LABEL[domain]} requests using specialized agents.`,
    '',
    'Available specialists:',
  ];
  for (const s of specs) lines.push(`- ${s.id}: ${s.description}`);
  lines.push(
    '',
    'Delegation strategy:',
    '- Delegate to the matching specialist for the request.',
    '- Specialists can read across modules via shared read tools — prefer one delegation hop.',
    "- In the delegation prompt describe only the user's ORIGINAL INTENT (what they asked for).",
    "  Do NOT suggest tool parameters, scopes, or filters — the specialist's own instructions",
    '  govern how it calls its tools.',
    '',
    'Workflows are reachable via REST/UI triggers (the workflow-approvals inbox),',
    'not from chat. If a user asks for a deterministic ranked list, tell them to',
    'use the out-of-chat trigger; do not try to invoke a workflow yourself.',
  );
  return lines.join('\n');
}
