import type { AgentTool } from '@seta/agent-sdk';
import { serverTimeTool } from './server-time.ts';

export { serverTimeTool };

export const coreAgentTools: AgentTool[] = [serverTimeTool];
