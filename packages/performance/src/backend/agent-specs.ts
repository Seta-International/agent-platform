// The ARIA specialist registration is a side-effect of importing the agent-tools
// register module. This file is the bridge imported by init-registry.ts.
import './agent-tools/register.ts';

import type { AgentSpec } from '@seta/core';

export const performanceAgentSpecs: AgentSpec[] = [];
