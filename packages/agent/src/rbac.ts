export const AGENT_PERMISSIONS = [
  'agent.chat.use',
  'agent.thread.read.self',
  'agent.thread.write.self',
  'agent.workflow.run.read.self',
  'agent.workflow.run.read.tenant',
  'agent.workflow.run.read.instance',
  'agent.workflow.run.execute.self',
  'agent.workflow.run.cancel.self',
  'agent.workflow.run.cancel.tenant',
  'agent.workflow.run.cancel.instance',
  'agent.workflow.approve',
] as const;

export type AgentPermission = (typeof AGENT_PERMISSIONS)[number];
