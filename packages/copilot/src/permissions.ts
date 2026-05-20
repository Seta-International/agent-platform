export const COPILOT_PERMISSIONS = [
  'copilot.chat.use',
  'copilot.thread.read.self',
  'copilot.thread.write.self',
  'copilot.workflow.run.read.self',
] as const;

export type CopilotPermission = (typeof COPILOT_PERMISSIONS)[number];
