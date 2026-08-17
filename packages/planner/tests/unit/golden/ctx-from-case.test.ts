import { expect, it } from 'vitest';
import { ctxFromCase, deriveObservedBehavior } from '../../fixtures/golden/ctx-from-case.ts';
import type { Trajectory } from '../../fixtures/golden/policy/trajectory.ts';
import type { GoldenCase } from '../../fixtures/golden/schema.ts';

const traj: Trajectory = {
  toolCalls: [
    { agentId: 'o', toolName: 'planner_queryTasksAgent', args: {}, ok: true },
    { agentId: 's', toolName: 'planner_queryTasks', args: { userId: 'u-1' }, ok: true },
  ],
};

const base = {
  schemaVersion: 1 as const,
  kind: 'agent' as const,
  id: 'PQ-X',
  category: 'happy',
  suites: ['smoke' as const],
  holdout: false,
  tags: [],
  actor: { tenantId: 't', userId: 'u-1' },
  input: { messages: [{ role: 'user' as const, content: 'How many open tasks?' }] },
  metrics: { enabled: ['A1'] },
};

it('maps expected.trajectory constraints and behavior into the policy context', () => {
  const c: GoldenCase = {
    ...base,
    expected: {
      behavior: 'answer',
      facts: [],
      trajectory: {
        requiredTools: ['planner_queryTasksAgent', 'planner_queryTasks'],
        allowedTools: [],
        forbiddenTools: [],
        requiredPartialOrder: [],
        argPredicates: [],
      },
    },
  } as GoldenCase;
  const ctx = ctxFromCase(c, traj, '8 open tasks');
  expect(ctx.constraints.requiredTools).toEqual(['planner_queryTasksAgent', 'planner_queryTasks']);
  expect(ctx.expectedBehaviorValue).toBe('answer');
  expect(ctx.observedBehavior).toBe('answer');
  expect(ctx.expectedDelegationTool).toBe('planner_queryTasksAgent');
  expect(ctx.answer).toBe('8 open tasks');
});

it('derives observedBehavior=empty for a blank answer and defaults empty constraints', () => {
  const c: GoldenCase = { ...base, expected: { behavior: 'empty', facts: [] } } as GoldenCase;
  const ctx = ctxFromCase(c, { toolCalls: [] }, '   ');
  expect(ctx.observedBehavior).toBe('empty');
  expect(ctx.constraints.requiredTools).toEqual([]);
});

it('passes forbidden output through for no_fabrication', () => {
  const c: GoldenCase = {
    ...base,
    expected: {
      behavior: 'refuse',
      facts: [],
      output: { forbiddenEntities: ['Hacked'], forbiddenText: ['system prompt'] },
    },
  } as GoldenCase;
  const ctx = ctxFromCase(c, { toolCalls: [] }, 'I cannot do that');
  expect(ctx.forbiddenEntities).toEqual(['Hacked']);
  expect(ctx.forbiddenText).toEqual(['system prompt']);
});

// --- observed-behavior classifier (design A: trajectory-aware) --------------

/** Builds an agent case with the given expected behavior; body is irrelevant to
 *  the classifier (it reads answer + trajectory, not expected). */
function agentCase(behavior: string): GoldenCase {
  return { ...base, expected: { behavior, facts: [] } } as GoldenCase;
}

const RefuseCases: [string, string][] = [
  ['plain cannot', 'I cannot create tasks.'],
  ['read-only', 'I can only answer questions — this agent is read-only.'],
  ['not permitted', "I'm not permitted to modify tasks."],
  ['not able to', "I'm not able to assign that."],
  ['out of domain', "I can't help with that; I only answer planner questions."],
];
it.each(RefuseCases)('classifies refusal (%s) as refuse', (_label, answer) => {
  const ctx = ctxFromCase(agentCase('refuse'), { toolCalls: [] }, answer);
  expect(ctx.observedBehavior).toBe('refuse');
});

it('classifies a disambiguation question as clarify', () => {
  const answer = 'There is more than one match. Which one did you mean — Nguyen A or Nguyen B?';
  const ctx = ctxFromCase(agentCase('clarify'), { toolCalls: [] }, answer);
  expect(ctx.observedBehavior).toBe('clarify');
});

it('does not classify a normal answer containing a question mark as clarify', () => {
  const answer = 'You have 3 tasks due this week. Want me to list them?';
  const ctx = ctxFromCase(agentCase('answer'), { toolCalls: [] }, answer);
  expect(ctx.observedBehavior).toBe('answer');
});

it('classifies a failed tool call (ok:false) with a substantive answer as error-recovery', () => {
  const traj: Trajectory = {
    toolCalls: [{ agentId: 's', toolName: 'planner_getTask', args: {}, ok: false }],
  };
  const ctx = ctxFromCase(agentCase('error-recovery'), traj, "I couldn't find that task.");
  expect(ctx.observedBehavior).toBe('error-recovery');
});

it('classifies a graceful {error} tool result narrated as a failure as error-recovery', () => {
  const traj: Trajectory = {
    toolCalls: [
      {
        agentId: 's',
        toolName: 'planner_getBoardSnapshot',
        args: {},
        ok: true,
        result: { error: 'No accessible plan found matching that criteria.' },
      },
    ],
  };
  const ctx = ctxFromCase(
    agentCase('error-recovery'),
    traj,
    "I couldn't find that board. Please check the name.",
  );
  expect(ctx.observedBehavior).toBe('error-recovery');
});

it('classifies an empty result set from a collection tool as empty', () => {
  const traj: Trajectory = {
    toolCalls: [
      { agentId: 'o', toolName: 'planner_queryTasksAgent', args: {}, ok: true },
      {
        agentId: 's',
        toolName: 'planner_queryTasks',
        args: {},
        ok: true,
        result: { tasks: [], nextCursor: null },
      },
    ],
  };
  const ctx = ctxFromCase(agentCase('empty'), traj, 'No tasks match that query.');
  expect(ctx.observedBehavior).toBe('empty');
});

it('classifies an empty skills search as empty', () => {
  const traj: Trajectory = {
    toolCalls: [
      {
        agentId: 's',
        toolName: 'planner_searchGroupMembersBySkills',
        args: {},
        ok: true,
        result: { candidates: [] },
      },
    ],
  };
  const ctx = ctxFromCase(agentCase('empty'), traj, 'No one on your team has that skill.');
  expect(ctx.observedBehavior).toBe('empty');
});

it('does NOT treat an empty resolver result as empty (not-found entity is an answer)', () => {
  const traj: Trajectory = {
    toolCalls: [
      {
        agentId: 's',
        toolName: 'planner_resolveMember',
        args: {},
        ok: true,
        result: { candidates: [] },
      },
    ],
  };
  const ctx = ctxFromCase(agentCase('answer'), traj, 'No member named Gandalf exists.');
  expect(ctx.observedBehavior).toBe('answer');
});

it('treats an empty AUXILIARY list alongside a populated entity as answer, not empty', () => {
  // PQ-009 shape: getTask returns the task; listComments returns [] (no
  // discussion). The user got an answer about the task — not an "empty" result.
  const traj: Trajectory = {
    toolCalls: [
      { agentId: 'o', toolName: 'planner_taskDetailAgent', args: {}, ok: true },
      {
        agentId: 's',
        toolName: 'planner_queryTasks',
        args: {},
        ok: true,
        result: { tasks: [{ taskId: 't1' }], nextCursor: null },
      },
      { agentId: 's', toolName: 'planner_getTask', args: {}, ok: true, result: { task: {} } },
      {
        agentId: 's',
        toolName: 'planner_listComments',
        args: {},
        ok: true,
        result: { comments: [] },
      },
    ],
  };
  const ctx = ctxFromCase(agentCase('answer'), traj, 'This task has no discussion yet.');
  expect(ctx.observedBehavior).toBe('answer');
});

it('classifies an empty SEARCH result as empty even when an auxiliary lookup returned data', () => {
  // PQ-019 shape: getBoardSnapshot resolves board Alpha (data), but the actual
  // queryTasks(quantum) search returns nothing — the user's ask found nothing.
  const traj: Trajectory = {
    toolCalls: [
      { agentId: 'o', toolName: 'planner_queryTasksAgent', args: {}, ok: true },
      {
        agentId: 's',
        toolName: 'planner_getBoardSnapshot',
        args: {},
        ok: true,
        result: { planId: 'p1', tasks: [{ id: 'x' }] },
      },
      {
        agentId: 's',
        toolName: 'planner_queryTasks',
        args: {},
        ok: true,
        result: { tasks: [], nextCursor: null },
      },
    ],
  };
  const ctx = ctxFromCase(agentCase('empty'), traj, 'No tasks about quantum computing on Alpha.');
  expect(ctx.observedBehavior).toBe('empty');
});

it('classifies a populated collection result as answer', () => {
  const traj: Trajectory = {
    toolCalls: [
      {
        agentId: 's',
        toolName: 'planner_queryTasks',
        args: {},
        ok: true,
        result: { tasks: [{ taskId: 't1' }], nextCursor: null },
      },
    ],
  };
  const ctx = ctxFromCase(agentCase('answer'), traj, 'You have 1 task due this week.');
  expect(ctx.observedBehavior).toBe('answer');
});

// --- FUT-825: write-turn signals and the Vietnamese classifier ---------------

const emptyTrajectory: Trajectory = { toolCalls: [] };

it('classifies a suspended turn as confirm even when the narration reads like a question', () => {
  // The exact production shape: A2 narrates "…confirm?" and the card is the
  // real gate. Text alone would call this a clarify.
  expect(
    deriveObservedBehavior(
      'Đổi due date của Deploy API sang 19/08 — bạn xác nhận nhé?',
      emptyTrajectory,
      { suspended: true },
    ),
  ).toBe('confirm');
});

it('classifies a resumed turn as applied', () => {
  expect(
    deriveObservedBehavior('Đã đổi due date sang 19/08.', emptyTrajectory, { applied: true }),
  ).toBe('applied');
});

it('leaves classification unchanged when no write signal is given', () => {
  expect(deriveObservedBehavior('Tuan has 12 open tasks.', emptyTrajectory)).toBe('answer');
});

it('recognises Vietnamese refusals', () => {
  for (const answer of [
    'Tôi không thể xoá vĩnh viễn một task.',
    'Bạn không có quyền sửa task trong nhóm đó.',
    'Yêu cầu này vượt quá giới hạn 20 task mỗi lần, nên tôi không thay đổi gì cả.',
    'Tôi chỉ có thể thay đổi task, không trả lời câu hỏi chung.',
  ]) {
    expect(deriveObservedBehavior(answer, emptyTrajectory)).toBe('refuse');
  }
});

it('recognises Vietnamese disambiguation questions', () => {
  for (const answer of [
    'Có hai task tên "Deploy API" — bạn muốn đổi task nào?',
    'Ý bạn là task nào trong hai task này?',
    'Bạn muốn đặt due date là ngày nào?',
    'Thứ Sáu 14/08 hay 21/08?',
  ]) {
    expect(deriveObservedBehavior(answer, emptyTrajectory)).toBe('clarify');
  }
});

it('does not misread an ordinary Vietnamese confirmation as refuse or clarify', () => {
  // The narration A2 emits on a HAPPY turn. Must stay `answer` when no suspend
  // signal is supplied, or every happy case would score as a refusal.
  for (const answer of [
    'Đã đổi due date của "Deploy API" sang 19/08.',
    'Tôi đã tạo bản xem trước cho việc gán "Deploy API" cho Tuấn.',
  ]) {
    expect(deriveObservedBehavior(answer, emptyTrajectory)).toBe('answer');
  }
});
