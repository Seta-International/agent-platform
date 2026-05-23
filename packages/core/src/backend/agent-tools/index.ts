import type { CopilotTool } from '@seta/copilot-sdk';
import { serverTimeTool } from './server-time.ts';

export { serverTimeTool };

export const coreAgentTools: CopilotTool[] = [serverTimeTool];
