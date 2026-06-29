// Public surface for cross-module agent-tool composition.
// Actual tool definitions live under ./backend/agent-tools/; peers must
// never import from there directly. The package.json exports map points
// '@seta/people/agent-tools' at this file.
export {
  type GetAvailabilityInput,
  type GetAvailabilityOutput,
  type GetTimezoneInput,
  type GetTimezoneOutput,
  peopleAgentTools,
  peopleGetAvailabilitySpec,
  peopleGetAvailabilityTool,
  peopleGetTimezoneSpec,
  peopleGetTimezoneTool,
} from './backend/agent-tools.ts';
