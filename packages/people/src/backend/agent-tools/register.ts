import { AgentRegistry } from '@seta/agent-sdk';
import { peopleGetAvailabilitySpec } from './get-availability-for-user.ts';
import { peopleGetTimezoneSpec } from './get-timezone-for-user.ts';

AgentRegistry.registerCrossModuleReadTool(peopleGetAvailabilitySpec);
AgentRegistry.registerCrossModuleReadTool(peopleGetTimezoneSpec);
