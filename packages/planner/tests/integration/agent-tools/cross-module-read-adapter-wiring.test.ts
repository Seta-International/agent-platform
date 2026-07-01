import { peopleGetAvailabilityTool, peopleGetTimezoneTool } from '@seta/people/agent-tools';
import { plannerGetOpenTaskCountTool } from '@seta/planner/agent-tools';
import { describe, expect, it } from 'vitest';

describe('cross-module-read adapter wiring', () => {
  it.each([
    {
      tool: plannerGetOpenTaskCountTool,
      id: 'planner_getOpenTaskCountForUser',
      label: 'Open Task Count',
    },
    {
      tool: peopleGetTimezoneTool,
      id: 'people_getTimezoneForUser',
      label: 'Get Worker Timezone',
    },
    {
      tool: peopleGetAvailabilityTool,
      id: 'people_getAvailabilityForUser',
      label: 'Get Worker Availability',
    },
  ])('$id is wired as a Mastra-shaped tool with displayName=$label', ({ tool, id, label }) => {
    expect((tool as { id?: string }).id).toBe(id);
    expect((tool as { displayName?: string }).displayName).toBe(label);
    expect(typeof (tool as { execute?: unknown }).execute).toBe('function');
  });
});
