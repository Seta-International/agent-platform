import type { CopilotTool } from '@seta/copilot-sdk';
import { listMyRolesTool } from './list-my-roles.ts';
import { updateMyDisplayNameTool } from './update-my-display-name.ts';
import { whoAmITool } from './who-am-i.ts';

export { identityGetAvailabilityTool } from './get-availability-for-user.ts';
export { identityGetTimezoneTool } from './get-timezone-for-user.ts';
export { listMyRolesTool } from './list-my-roles.ts';
export {
  type MatchUsersToTopicToolDeps,
  matchUsersToTopicTool,
} from './match-users-to-topic.ts';
export { updateMyDisplayNameTool } from './update-my-display-name.ts';
export { whoAmITool } from './who-am-i.ts';

/**
 * Tools contributed to the agent registry at module-registration time.
 *
 * matchUsersToTopicTool is a factory that needs runtime deps (provider, pool,
 * reranker), so it's instantiated by the copilot agent catalog at build time
 * rather than pre-registered here.
 */
export const identityAgentTools: CopilotTool[] = [
  whoAmITool,
  listMyRolesTool,
  updateMyDisplayNameTool,
];
