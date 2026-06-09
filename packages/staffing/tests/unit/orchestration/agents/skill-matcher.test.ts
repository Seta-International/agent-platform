import { describe, expect, it } from 'vitest';
import { makeSkillMatcherAgent } from '../../../../src/backend/orchestration/agents/skill-matcher.ts';
import type {
  SkillSearchPort,
  TaskReaderPort,
} from '../../../../src/backend/orchestration/ports.ts';

const ctx = { tenantId: 't1', actorUserId: 'a1' };
const skillSearch: SkillSearchPort = {
  async search() {
    return [{ userId: 'u1', name: 'A', skills: ['aws'], role: null, similarity: 0.6 }];
  },
};

/** A taskReader stub whose task carries the given assignees (skills unused here). */
function taskReaderWith(assigneeIds: string[]): TaskReaderPort {
  return {
    async load(taskId) {
      return { taskId, title: 'T', description: null, groupId: '', skillTags: [], assigneeIds };
    },
  };
}
const noAssignees = taskReaderWith([]);

/** rankCandidates tool result for the given users (skillMatchCount/rank derived by index). */
function ranked(users: { userId: string; name: string }[]) {
  return {
    payload: {
      toolName: 'rankCandidates',
      result: {
        candidates: users.map((u, i) => ({
          userId: u.userId,
          name: u.name,
          skills: ['aws'],
          role: null,
          skillMatchCount: 1,
          rank: i + 1,
        })),
      },
    },
  };
}

describe('skillMatcher agent', () => {
  it('reads candidates from the rankCandidates tool result + derives trust', async () => {
    const agent = makeSkillMatcherAgent({
      skillSearch,
      taskReader: noAssignees,
      resolveModel: () => ({}) as never,
      runAgent: async () => ({
        toolCalls: [{ payload: { toolName: 'searchCandidates', args: { skills: ['aws'] } } }],
        toolResults: [
          {
            payload: {
              toolName: 'searchCandidates',
              result: {
                hits: [{ userId: 'u1', name: 'A', skills: ['aws'], role: null, similarity: 0.6 }],
              },
            },
          },
          ranked([{ userId: 'u1', name: 'A' }]),
        ],
      }),
    });
    const res = await agent.run({ taskId: 't-1', skills: ['aws'] }, ctx);
    expect(res.result.taskId).toBe('t-1');
    expect(res.result.candidates[0]?.userId).toBe('u1');
    expect(res.trust.evidenceCitations.some((c) => c.id === 'u1')).toBe(true);
    expect(res.trust.confidenceScore).toBeCloseTo(0.6);
  });

  it('falls back to ranking search hits when rankCandidates was not called', async () => {
    const agent = makeSkillMatcherAgent({
      skillSearch,
      taskReader: noAssignees,
      resolveModel: () => ({}) as never,
      runAgent: async () => ({
        toolCalls: [{ payload: { toolName: 'searchCandidates', args: { skills: ['aws'] } } }],
        toolResults: [
          {
            payload: {
              toolName: 'searchCandidates',
              result: {
                hits: [{ userId: 'u1', name: 'A', skills: ['aws'], role: null, similarity: 0.6 }],
              },
            },
          },
        ],
      }),
    });
    const res = await agent.run({ taskId: 't-1', skills: ['aws'] }, ctx);
    expect(res.result.candidates[0]?.userId).toBe('u1');
    expect(res.result.candidates[0]?.skillMatchCount).toBe(1);
  });

  it('excludes the requester (actorUserId) from candidates and citations', async () => {
    const agent = makeSkillMatcherAgent({
      skillSearch,
      taskReader: noAssignees,
      resolveModel: () => ({}) as never,
      runAgent: async () => ({
        toolCalls: [{ payload: { toolName: 'searchCandidates', args: { skills: ['aws'] } } }],
        toolResults: [
          {
            payload: {
              toolName: 'searchCandidates',
              result: {
                hits: [
                  { userId: 'a1', name: 'Me', skills: ['aws'], role: null, similarity: 0.9 },
                  { userId: 'u2', name: 'B', skills: ['aws'], role: null, similarity: 0.6 },
                ],
              },
            },
          },
          ranked([
            { userId: 'a1', name: 'Me' },
            { userId: 'u2', name: 'B' },
          ]),
        ],
      }),
    });
    // ctx.actorUserId === 'a1' — the requester must not be recommended to themselves.
    const res = await agent.run({ taskId: 't-1', skills: ['aws'] }, ctx);
    expect(res.result.candidates.map((c) => c.userId)).toEqual(['u2']);
    expect(res.trust.evidenceCitations.some((c) => c.id === 'a1')).toBe(false);
  });

  it('excludes users already assigned to the task and renumbers rank', async () => {
    const agent = makeSkillMatcherAgent({
      skillSearch,
      // u2 is already assigned to the task — must not be recommended again.
      taskReader: taskReaderWith(['u2']),
      resolveModel: () => ({}) as never,
      runAgent: async () => ({
        toolCalls: [{ payload: { toolName: 'searchCandidates', args: { skills: ['aws'] } } }],
        toolResults: [
          ranked([
            { userId: 'u2', name: 'B' },
            { userId: 'u3', name: 'C' },
            { userId: 'u4', name: 'D' },
          ]),
        ],
      }),
    });
    const res = await agent.run({ taskId: 't-1', skills: ['aws'] }, ctx);
    expect(res.result.candidates.map((c) => c.userId)).toEqual(['u3', 'u4']);
    // Ranks stay contiguous after the assigned user is dropped.
    expect(res.result.candidates.map((c) => c.rank)).toEqual([1, 2]);
  });

  it('does not read assignees for a task-less people search (taskId null)', async () => {
    let loadCalled = false;
    const agent = makeSkillMatcherAgent({
      skillSearch,
      taskReader: {
        async load(taskId) {
          loadCalled = true;
          return {
            taskId,
            title: 'T',
            description: null,
            groupId: '',
            skillTags: [],
            assigneeIds: [],
          };
        },
      },
      resolveModel: () => ({}) as never,
      runAgent: async () => ({
        toolCalls: [{ payload: { toolName: 'searchCandidates', args: { skills: ['aws'] } } }],
        toolResults: [
          ranked([
            { userId: 'a1', name: 'Me' },
            { userId: 'u2', name: 'B' },
          ]),
        ],
      }),
    });
    const res = await agent.run({ taskId: null, skills: ['aws'] }, ctx);
    // No task → no assignee lookup, but the requester is still excluded.
    expect(loadCalled).toBe(false);
    expect(res.result.candidates.map((c) => c.userId)).toEqual(['u2']);
  });
});
