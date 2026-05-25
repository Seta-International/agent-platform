import type { CopilotRegistry, Domain } from '@seta/copilot-sdk';

type Snapshot = ReturnType<typeof CopilotRegistry.snapshot>;

const DOMAIN_LABEL: Record<Domain, string> = {
  work: 'Work',
  people: 'People',
  self: 'Self',
  meta: 'Meta',
};

const DOMAIN_BLURB: Record<Domain, string> = {
  work: 'Tasks, plans, projects, deliverables, time tracking',
  people: 'Users, roles, permissions, org structure',
  self: 'Current user profile, preferences, notifications',
  meta: 'About this assistant: capabilities, status, settings',
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
  const wfs = snapshot.workflows.filter((w) => w.domain === domain);
  const lines = [
    `You coordinate ${DOMAIN_LABEL[domain]} requests using specialized agents and workflows.`,
    '',
    'Available specialists:',
  ];
  for (const s of specs) lines.push(`- ${s.id}: ${s.description}`);
  if (wfs.length > 0) {
    lines.push('', 'Available workflows (deterministic multi-step):');
    for (const w of wfs) lines.push(`- ${w.id}: ${w.description}`);
  }
  lines.push(
    '',
    'Delegation strategy:',
    '- For single-module requests, delegate to the owning specialist.',
    '- For known multi-step flows, call the workflow directly.',
    '- Specialists can read across modules via shared read tools — prefer one delegation hop.',
  );
  return lines.join('\n');
}
