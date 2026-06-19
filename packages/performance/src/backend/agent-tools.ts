import type { AgentTool } from '@seta/agent-sdk';
import { evaluateNormTool } from './agent-tools/evaluate-norm.ts';
import { formatOutputTool } from './agent-tools/format-output.ts';
import { getAllocationTool } from './agent-tools/get-allocation.ts';
import { getEmployeeProfileTool } from './agent-tools/get-employee-profile.ts';
import { getPerformanceDataTool } from './agent-tools/get-performance-data.ts';
import { getTimesheetTool } from './agent-tools/get-timesheet.ts';
import { getViolationsTool } from './agent-tools/get-violations.ts';

export const performanceAgentTools: AgentTool[] = [
  getEmployeeProfileTool,
  getPerformanceDataTool,
  getTimesheetTool,
  getViolationsTool,
  getAllocationTool,
  evaluateNormTool,
  formatOutputTool,
];
