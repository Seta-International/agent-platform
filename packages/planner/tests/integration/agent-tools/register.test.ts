import { CopilotRegistry } from '@seta/copilot-sdk';
import { beforeEach, describe, expect, it } from 'vitest';

describe('planner register', () => {
  beforeEach(() => CopilotRegistry.__resetForTests());

  it('registers a planner specialist + dedupOnCreate workflow on the Work supervisor', async () => {
    await import('../../../src/backend/agent-tools/register.ts');
    const work = CopilotRegistry.listSpecialists('work');
    expect(work).toHaveLength(1);
    const planner = work[0]!;
    expect(planner.id).toBe('planner');
    expect(planner.description).toMatch(/tasks/i);
    expect(Object.keys(planner.tools).sort()).toEqual(
      [
        'planner_assignTask',
        'planner_createTask',
        'planner_getTask',
        'search_tasks_semantic',
        'search_users_by_skills',
      ].sort(),
    );

    const workflows = CopilotRegistry.listWorkflows('work');
    const dedup = workflows.find((w) => w.id === 'dedupOnCreate');
    expect(dedup).toBeDefined();
    expect(dedup?.hitlSteps).toContain('dedupOnCreate.run');
  });
});
