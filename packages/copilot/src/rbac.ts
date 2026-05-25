export const COPILOT_PERMISSIONS = [
  'copilot.chat.use',
  'copilot.thread.read.self',
  'copilot.thread.write.self',
  'copilot.workflow.run.read.self',
  'copilot.workflow.run.read.tenant',
  'copilot.workflow.run.read.instance',
  'copilot.workflow.run.execute.self',
  'copilot.workflow.run.cancel.self',
  'copilot.workflow.run.cancel.tenant',
  'copilot.workflow.run.cancel.instance',
  'copilot.workflow.approve',
] as const;

export type CopilotPermission = (typeof COPILOT_PERMISSIONS)[number];
