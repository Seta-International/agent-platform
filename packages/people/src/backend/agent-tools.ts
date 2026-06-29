import type { AgentTool } from '@seta/agent-sdk';

export {
  type GetAvailabilityInput,
  type GetAvailabilityOutput,
  peopleGetAvailabilitySpec,
  peopleGetAvailabilityTool,
} from './agent-tools/get-availability-for-user.ts';
export {
  type GetTimezoneInput,
  type GetTimezoneOutput,
  peopleGetTimezoneSpec,
  peopleGetTimezoneTool,
} from './agent-tools/get-timezone-for-user.ts';
export {
  type MatchUsersToTopicToolDeps,
  matchUsersToTopicTool,
} from './agent-tools/match-users-by-topic.ts';
export {
  buildSearchUsersBySkillVectorSpec,
  type SearchUsersBySkillVectorDeps,
  type SearchUsersBySkillVectorInput,
  type SearchUsersBySkillVectorOutput,
} from './agent-tools/search-users-by-skill-vector.ts';

export const peopleAgentTools: AgentTool[] = [];
