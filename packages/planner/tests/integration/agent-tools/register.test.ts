import { CopilotRegistry } from '@seta/copilot-sdk';
import { beforeEach, describe, expect, it } from 'vitest';

describe('planner register', () => {
  beforeEach(() => CopilotRegistry.__resetForTests());

  it('registers a planner specialist + workflows + cross-module reads on the Work supervisor', async () => {
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
        'planner_suggestAssignee',
        'search_tasks_semantic',
        'search_users_by_skills',
      ].sort(),
    );

    const workflows = CopilotRegistry.listWorkflows('work');
    const dedup = workflows.find((w) => w.id === 'dedupOnCreate');
    expect(dedup).toBeDefined();
    expect(dedup?.hitlSteps).toContain('dedupOnCreate.run');

    const assign = workflows.find((w) => w.id === 'assignBySkill');
    expect(assign).toBeDefined();
    expect(assign?.hitlSteps).toContain('assignBySkill.run');

    const reads = CopilotRegistry.listCrossModuleReadTools().map((t) => t.id);
    expect(reads).toContain('planner_getOpenTaskCountForUser');
  });
});
