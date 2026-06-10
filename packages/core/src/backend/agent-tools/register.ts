import { AgentRegistry } from '@seta/agent-sdk';
import { serverTimeSpec } from './server-time.ts';

AgentRegistry.registerCrossModuleReadTool(serverTimeSpec);
