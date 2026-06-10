import { type Statement, toManifest } from '@seta/shared-rbac';

export const agentStatement = {
  'agent.chat': ['use'],
  'agent.thread': ['read.self', 'write.self', 'erase.any'],
  'agent.workflow.run': [
    'read.self',
    'read.tenant',
    'read.instance',
    'execute.self',
    'cancel.self',
    'cancel.tenant',
    'cancel.instance',
  ],
  'agent.workflow': ['approve'],
  'agent.config': ['read', 'write'],
  'agent.rate_limit': ['read'],
  'agent.specialist': ['use'],
  'agent.meta': ['read.self'],
} as const satisfies Statement;

const roleStatements = {
  'agent.admin': {
    'agent.chat': ['use'],
    'agent.thread': ['read.self', 'write.self', 'erase.any'],
    'agent.workflow.run': [
      'read.self',
      'read.tenant',
      'execute.self',
      'cancel.self',
      'cancel.tenant',
    ],
    'agent.config': ['read', 'write'],
    'agent.rate_limit': ['read'],
    'agent.specialist': ['use'],
  },
  'agent.contributor': {
    'agent.chat': ['use'],
    'agent.thread': ['read.self', 'write.self'],
    'agent.workflow.run': ['read.self', 'execute.self', 'cancel.self'],
    'agent.specialist': ['use'],
  },
  'agent.viewer': {
    'agent.chat': ['use'],
    'agent.thread': ['read.self', 'write.self'],
    'agent.workflow.run': ['read.self', 'read.tenant'],
    'agent.config': ['read'],
    'agent.rate_limit': ['read'],
  },
} as const satisfies Record<string, Statement>;

export const agentRbac = toManifest('agent', agentStatement, roleStatements, {
  'agent.admin': 'Full agent administration',
  'agent.contributor': 'Use agents and run workflows',
  'agent.viewer': 'Use agents and read workflow runs',
});

export type AgentPermission = (typeof agentRbac.permissions)[number]['key'];

export const AGENT_PERMISSIONS = agentRbac.permissions.map((p) => p.key);

export const AGENT_ROLE_SLUGS = agentRbac.roles.map((r) => r.slug) as Array<
  'agent.admin' | 'agent.contributor' | 'agent.viewer'
>;
export type AgentRoleSlug = (typeof AGENT_ROLE_SLUGS)[number];

export const AGENT_ROLE_PERMISSIONS = Object.fromEntries(
  agentRbac.roles.map((r) => [r.slug, r.permissions]),
) as Record<AgentRoleSlug, string[]>;
