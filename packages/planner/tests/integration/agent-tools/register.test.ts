import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('planner register', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('registers a planner specialist + workflows + cross-module reads on the Work supervisor', async () => {
    const { AgentRegistry } = await import('@seta/agent-sdk');
    await import('../../../src/backend/agent-tools/register.ts');
    const work = AgentRegistry.listSpecialists('work');
    expect(work).toHaveLength(1);
    const planner = work[0]!;
    expect(planner.id).toBe('planner');
    expect(planner.description).toMatch(/tasks/i);
    expect(Object.keys(planner.tools).sort()).toEqual(
      [
        'identity_getAvailabilityForUser',
        'identity_getTimezoneForUser',
        'identity_whoAmI',
        'planner_assignTask',
        'planner_createTask',
        'planner_findSimilarTasks',
        'planner_getOpenTaskCountForUser',
        'planner_getTask',
        'planner_listComments',
        'planner_postComment',
        'planner_queryTasks',
        'planner_searchGroupMembersBySkills',
        'planner_setAssignees',
      ].sort(),
    );

    const workflows = AgentRegistry.listWorkflows('work');
    const dedup = workflows.find((w) => w.id === 'dedupOnCreate');
    expect(dedup).toBeDefined();
    expect(dedup?.hitlSteps).toContain('dedupOnCreate.decide');

    const assign = workflows.find((w) => w.id === 'assignBySkill');
    expect(assign).toBeDefined();
    expect(assign?.hitlSteps).toContain('assignBySkill.suggest');

    const reads = AgentRegistry.listCrossModuleReadTools().map((t) => t.id);
    expect(reads).toContain('planner_getOpenTaskCountForUser');
  });

  it('instructions describe the reasoning playbook (signals + tool choices)', async () => {
    const { AgentRegistry } = await import('@seta/agent-sdk');
    await import('../../../src/backend/agent-tools/register.ts');
    const planner = AgentRegistry.listSpecialists('work')[0]!;
    const instructions = planner.instructions({ runtimeContext: {} });
    expect(instructions).toMatch(/reason/i);
    expect(instructions).toMatch(/planner_findSimilarTasks/);
    expect(instructions).toMatch(/planner_proposeAssignment/);
    expect(instructions).not.toMatch(/planner_suggestAssignee/);
    expect(instructions).not.toMatch(/search_tasks_semantic/);
  });

  it('instructs the agent to not race an open Suggest workflow run', async () => {
    const { AgentRegistry } = await import('@seta/agent-sdk');
    await import('../../../src/backend/agent-tools/register.ts');
    const planner = AgentRegistry.listSpecialists('work')[0]!;
    const instructions = planner.instructions({ runtimeContext: {} });
    expect(instructions).toMatch(/pendingAssignWorkflowRunId/);
    expect(instructions).toMatch(/inbox|wait/i);
  });
});
