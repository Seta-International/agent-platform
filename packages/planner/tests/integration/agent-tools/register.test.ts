import { CopilotRegistry } from '@seta/copilot-sdk';
import { beforeEach, describe, expect, it } from 'vitest';

describe('planner register', () => {
  beforeEach(() => CopilotRegistry.__resetForTests());

  it('registers a planner specialist in work domain with all current tools', async () => {
    await import('../../../src/backend/agent-tools/register.ts');
    const work = CopilotRegistry.listSpecialists('work');
    expect(work).toHaveLength(1);
    const planner = work[0]!;
    expect(planner.id).toBe('planner');
    expect(planner.description).toMatch(/tasks/i);
    expect(Object.keys(planner.tools).sort()).toEqual(
      [
        'planner_assignTask',
        'planner_getTask',
        'search_tasks_semantic',
        'search_users_by_skills',
      ].sort(),
    );
  });
});
