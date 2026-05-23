import type { CopilotTool } from '@seta/copilot-sdk';
import { staffingRunNewTaskSkillTagTool } from './run-new-task-skill-tag.ts';

export * from './analyzer/index.ts';
export * from './avai-checker/index.ts';
export * from './recommender/index.ts';
export * from './run-new-task-skill-tag.ts';
export * from './skill-matcher/index.ts';

export const staffingAgentTools: CopilotTool[] = [staffingRunNewTaskSkillTagTool];
