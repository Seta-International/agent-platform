import type { AgentTool } from '@seta/agent-sdk';
import { listMyRolesTool } from './list-my-roles.ts';
import { updateMyDisplayNameTool } from './update-my-display-name.ts';
import { whoAmITool } from './who-am-i.ts';

export { listMyRolesTool } from './list-my-roles.ts';
export { updateMyDisplayNameTool } from './update-my-display-name.ts';
export { whoAmITool } from './who-am-i.ts';

/**
 * Tools contributed to the agent registry at module-registration time.
 */
export const identityAgentTools: AgentTool[] = [
  whoAmITool,
  listMyRolesTool,
  updateMyDisplayNameTool,
];
