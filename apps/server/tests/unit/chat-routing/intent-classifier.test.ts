import { describe, expect, it, vi } from 'vitest';
import { makeIntentClassifier } from '../../../src/chat-routing/intent-classifier.ts';

describe('chat intent classifier (tier 2: assignment vs planner_qna)', () => {
  const classify = makeIntentClassifier({ resolveModel: () => ({}) as never });

  it('routes question intents to planner_qna by rules (no LLM call)', async () => {
    const questions = [
      'what are my open tasks?',
      'how many members are in my team?',
      'which plans exist in this group?',
      'who is in this group?',
      'show me tasks about the billing migration',
      'when is this task due?',
    ];
    for (const q of questions) {
      expect(await classify(q)).toBe('planner_qna');
    }
  });

  it('routes action/recommend intents to assignment by rules (no LLM call)', async () => {
    const actions = [
      'who should I assign to this task?',
      'find people with skill react for this task',
      // 'reassign this to Bob' used to live here. FUT-806 D1 moved it: the user
      // NAMED the person, so it is a change request for A2, not a recommend.
      // Its replacement assertion is in 'intent routing after FUT-806' below.
      'recommend an owner for the launch task',
    ];
    for (const a of actions) {
      expect(await classify(a)).toBe('assignment');
    }
  });

  it('routes English find-tasks-by-label queries to assignment by rules (no LLM call)', async () => {
    const queries = [
      'list tasks with label backend',
      'find tasks tagged devops',
      'find open tasks in infrastructure',
      'any open tasks for the design label',
      'tìm task frontend đang mở',
    ];
    for (const q of queries) {
      expect(await classify(q), q).toBe('assignment');
    }
  });

  it('Vietnamese find-tasks queries reach LLM and are not hard-blocked to planner_qna', async () => {
    // Pure-Vietnamese task-by-criteria queries cannot be regex-matched reliably.
    // They must fall through to LLM fallback (not short-circuit to planner_qna).
    const queries = [
      'có task infrastructure nào đang open không',
      'tôi đang có task nào quá hạn không',
    ];
    for (const q of queries) {
      const llm = vi.fn(async () => 'assignment' as const);
      const c = makeIntentClassifier({ resolveModel: () => ({}) as never, classifyLlm: llm });
      const out = await c(q);
      expect(llm, `${q} — should reach LLM`).toHaveBeenCalledOnce();
      expect(out, q).toBe('assignment');
    }
  });

  it('falls back to the LLM seam only for ambiguous text, defaulting safe', async () => {
    const llm = vi.fn(async () => 'assignment' as const);
    const c = makeIntentClassifier({ resolveModel: () => ({}) as never, classifyLlm: llm });
    const out = await c('hmm');
    expect(llm).toHaveBeenCalledOnce();
    expect(out).toBe('assignment');
  });

  it('routes weekly-planning intents to weekly_planner by rules (no LLM call)', async () => {
    const phrases = [
      'plan my week',
      'Plan my week please',
      'can you plan next week for me',
      'weekly plan for my tasks',
      'organize my week',
      'organise my tasks',
      'schedule my week',
      'prioritize my tasks',
      'lập kế hoạch tuần này',
      'sắp xếp công việc tuần sau',
    ];
    for (const p of phrases) {
      expect(await classify(p), p).toBe('weekly_planner');
    }
  });

  it('weekly phrasing wins over ACTION_RE overlaps', async () => {
    // "prioritize my tasks" contains "tasks" but is planning, not assignment.
    expect(await classify('help me prioritize my tasks for this week')).toBe('weekly_planner');
  });

  it('non-planning task queries still route as before', async () => {
    expect(await classify('what are my open tasks?')).toBe('planner_qna');
    expect(await classify('who should I assign to this task?')).toBe('assignment');
  });

  it('LLM fallback can return weekly_planner', async () => {
    const llm = vi.fn(async () => 'weekly_planner' as const);
    const c = makeIntentClassifier({ resolveModel: () => ({}) as never, classifyLlm: llm });
    expect(await c('hmm')).toBe('weekly_planner');
  });

  it('forwards history to LLM seam for ambiguous follow-ups', async () => {
    const llm = vi.fn(async () => 'planner_qna' as const);
    const c = makeIntentClassifier({ resolveModel: () => ({}) as never, classifyLlm: llm });
    const history = [
      { role: 'user' as const, content: 'find tasks about design' },
      { role: 'assistant' as const, content: 'Found 3 tasks about design.' },
    ];
    await c('cho toi chi tiet cai dau tien', history);
    expect(llm).toHaveBeenCalledWith('cho toi chi tiet cai dau tien', history);
  });

  it('regex fast-paths ignore history', async () => {
    const llm = vi.fn(async () => 'assignment' as const);
    const c = makeIntentClassifier({ resolveModel: () => ({}) as never, classifyLlm: llm });
    const history = [
      { role: 'user' as const, content: 'something' },
      { role: 'assistant' as const, content: 'response' },
    ];
    expect(await c('what are my open tasks?', history)).toBe('planner_qna');
    expect(llm).not.toHaveBeenCalled();
  });

  it('classify works without history (backward compatible)', async () => {
    const llm = vi.fn(async () => 'assignment' as const);
    const c = makeIntentClassifier({ resolveModel: () => ({}) as never, classifyLlm: llm });
    await c('hmm');
    expect(llm).toHaveBeenCalledWith('hmm', undefined);
  });

  describe('confirmation follow-ups re-use previous intent', () => {
    const assignmentHistory = [
      { role: 'user' as const, content: 'find tasks with label backend' },
      { role: 'assistant' as const, content: 'Found 3 tasks. Want me to recommend someone?' },
    ];
    const qnaHistory = [
      { role: 'user' as const, content: 'what are my open tasks?' },
      { role: 'assistant' as const, content: 'You have 5 open tasks.' },
    ];

    it('"yes" after assignment turn stays assignment (no LLM call)', async () => {
      const llm = vi.fn(async () => 'planner_qna' as const);
      const c = makeIntentClassifier({ resolveModel: () => ({}) as never, classifyLlm: llm });
      expect(await c('yes', assignmentHistory)).toBe('assignment');
      expect(llm).not.toHaveBeenCalled();
    });

    it('"ok" after planner_qna turn stays planner_qna', async () => {
      const llm = vi.fn(async () => 'assignment' as const);
      const c = makeIntentClassifier({ resolveModel: () => ({}) as never, classifyLlm: llm });
      expect(await c('ok', qnaHistory)).toBe('planner_qna');
      expect(llm).not.toHaveBeenCalled();
    });

    it('Vietnamese confirmations work ("có", "được", "đồng ý")', async () => {
      const llm = vi.fn(async () => 'planner_qna' as const);
      const c = makeIntentClassifier({ resolveModel: () => ({}) as never, classifyLlm: llm });
      for (const word of ['có', 'được', 'đồng ý', 'làm đi']) {
        expect(await c(word, assignmentHistory), word).toBe('assignment');
      }
      expect(llm).not.toHaveBeenCalled();
    });

    it('negations also stay on the same intent ("no", "không", "cancel")', async () => {
      const llm = vi.fn(async () => 'planner_qna' as const);
      const c = makeIntentClassifier({ resolveModel: () => ({}) as never, classifyLlm: llm });
      for (const word of ['no', 'không', 'cancel', 'thôi']) {
        expect(await c(word, assignmentHistory), word).toBe('assignment');
      }
      expect(llm).not.toHaveBeenCalled();
    });

    it('confirmation without history falls through to LLM', async () => {
      const llm = vi.fn(async () => 'assignment' as const);
      const c = makeIntentClassifier({ resolveModel: () => ({}) as never, classifyLlm: llm });
      await c('yes');
      expect(llm).toHaveBeenCalledOnce();
    });

    it('confirmation with non-classifiable history falls through to LLM', async () => {
      const llm = vi.fn(async () => 'assignment' as const);
      const c = makeIntentClassifier({ resolveModel: () => ({}) as never, classifyLlm: llm });
      const ambiguousHistory = [
        { role: 'user' as const, content: 'hmm interesting' },
        { role: 'assistant' as const, content: 'Can I help?' },
      ];
      await c('yes', ambiguousHistory);
      expect(llm).toHaveBeenCalledOnce();
    });
  });
});

describe('mutate intent (FUT-814)', () => {
  const classify = makeIntentClassifier({
    resolveModel: () => ({}) as never,
    // No row below may reach the LLM fallback; if one does, a regex tier failed
    // and the failure should say exactly that.
    classifyLlm: async () => {
      throw new Error('LLM fallback reached — a regex tier should have matched');
    },
  });

  it.each([
    'đổi due date của task Alpha sang thứ 6',
    'change the deadline on the API task to next Monday',
    'set the priority of task Alpha to urgent',
    'sửa tiêu đề task này thành "Migrate RDS"',
    'dời hạn task Alpha sang tuần sau',
    'mark this task as done',
    'đóng các task tagged infra',
    'close the AWS inventory task',
    'mở lại task Alpha',
    'tạo task mới cho nhóm tôi',
    'create a task for the migration',
    'gộp hai task này lại',
    'merge these two tasks',
    'liên kết task này với task kia',
    'xoá task Alpha',
    'delete the duplicate task',
  ])('routes %j to mutate', async (text) => {
    expect(await classify(text)).toBe('mutate');
  });

  // FUT-814's D3 kept every one of these on the assignment runtime, because A2
  // had no assign tool and routing them there turned a card into a refusal.
  // FUT-806 D1 gives A2 planner_assignTask and reverses the rule: each row NAMES
  // the person, so the agent has nothing to choose and the request is a change.
  // The rows are unchanged on purpose — this block is the record of the reversal.
  it.each([
    'change the assignee to Tuấn',
    'set owner to Tuấn',
    'đổi người phụ trách sang Tuấn',
    'sửa người được giao task này',
    'giao lại task cho Lan',
    'remove Tuấn from this task',
    'assign task này cho Tuấn',
  ])('routes %j to A2 now that a named person is a change request', async (text) => {
    expect(await classify(text)).toBe('mutate');
  });

  it.each(['what is the deadline of the API task?', 'how many open tasks do I have?'])(
    'keeps %j on planner_qna',
    async (text) => {
      expect(await classify(text)).toBe('planner_qna');
    },
  );

  // Pure-Vietnamese with no English question word and no recommend phrasing. The
  // claim under test is not "the rules route it" but "the mutate tier does not
  // STEAL it": it must still reach the LLM, which decides as it does today.
  it.each(['task nào của tôi quá hạn?'])(
    'leaves %j to the LLM rather than claiming it as mutate',
    async (text) => {
      const llm = vi.fn(async () => 'assignment' as const);
      const c = makeIntentClassifier({ resolveModel: () => ({}) as never, classifyLlm: llm });
      expect(await c(text)).toBe('assignment');
      expect(llm).toHaveBeenCalledOnce();
    },
  );

  it('keeps weekly planning ahead of every mutate verb', async () => {
    expect(await classify('sắp xếp công việc tuần này')).toBe('weekly_planner');
    expect(await classify('plan my week')).toBe('weekly_planner');
  });

  it('a bare confirmation after a mutate turn stays on A2', async () => {
    const history = [{ role: 'user' as const, content: 'đổi due date task Alpha sang thứ 6' }];
    expect(await classify('ừ, làm đi', history)).toBe('mutate');
  });

  // The history inference mirrors the classifier's order, so the reversal above
  // has to show up here too: the previous turn built an A2 card, and "ok" must
  // answer THAT card rather than start a recommend turn.
  it('a bare confirmation after a named-person assign stays on A2', async () => {
    const history = [{ role: 'user' as const, content: 'assign task này cho Tuấn' }];
    expect(await classify('ok', history)).toBe('mutate');
  });
});

// The English side of ACTION_RE already catches "find someone for this task" and
// "who should do this". The Vietnamese side carried exactly one alternative —
// `tìm task` — so every Vietnamese way of asking for a PERSON fell through to the
// non-deterministic LLM fallback, whose default arm is planner_qna. Same sentence,
// different orchestrator on different days: on a bad roll the read-only Q&A agent
// answered "I cannot find or assign people". These rows make the Vietnamese
// recommend intent deterministic, the way the English one already is.
describe('Vietnamese recommend intent routes to assignment by rules', () => {
  const classify = makeIntentClassifier({
    resolveModel: () => ({}) as never,
    // No row below may reach the LLM: reaching it IS the bug being fixed.
    classifyLlm: async () => {
      throw new Error('LLM fallback reached — the Vietnamese assignment guard did not match');
    },
  });

  it.each([
    'tìm người phù hợp cho task này',
    'tìm người phù hợp để làm task Alpha',
    'tìm người biết React',
    'tìm nhân sự cho task này',
    'tìm ai đó làm task này',
    'ai phù hợp với task này',
    'ai nên làm task này?',
    'ai có thể làm task này',
    'người nào phù hợp với task Alpha',
    'gợi ý người phù hợp cho task Alpha',
    'gợi ý ai đó cho task này',
    'đề xuất người làm task này',
    'nên giao task này cho ai',
    'giao task này cho ai',
  ])('routes %j to assignment', async (text) => {
    expect(await classify(text)).toBe('assignment');
  });

  // The guard runs BEFORE MUTATE_RE, which is the whole reason it lives in
  // ASSIGNEE_TARGET_RE and not in ACTION_RE: a recommend request that happens to
  // contain a change verb ("thêm", "giao") must still reach the assignment agent.
  it('wins over a change verb in the same sentence', async () => {
    expect(await classify('tìm người phù hợp và thêm vào task này')).toBe('assignment');
  });

  // Non-regression: the mutate tier must keep everything that is genuinely a
  // change request. These say nothing about a person.
  it.each([
    'tạo task mới cho nhóm tôi',
    'đổi due date của task Alpha sang thứ 6',
    'xoá task Alpha',
    'gộp hai task này lại',
    'liên kết task này với task kia',
  ])('leaves %j on mutate', async (text) => {
    expect(await classify(text)).toBe('mutate');
  });
});

describe('intent routing after FUT-806', () => {
  // classifyLlm throws: every row below must be decided by a regex. A row that
  // reaches the fallback is a routing hole, not a passing test.
  const classify = makeIntentClassifier({
    resolveModel: () => ({}) as never,
    classifyLlm: async () => {
      throw new Error('LLM fallback must not be reached for these phrasings');
    },
  });

  const cases: Array<[string, string]> = [
    // The agent must CHOOSE → recommend, unchanged.
    ['who should do this task', 'assignment'],
    ['ai nên làm task này', 'assignment'],
    ['recommend someone for the migration task', 'assignment'],
    ['gợi ý người cho task này', 'assignment'],
    ['find people with kubernetes skills', 'assignment'],
    // D10: "assign someone" names nobody, so it is a recommend request.
    ['assign someone to this', 'assignment'],
    ['assign anyone to the deploy task', 'assignment'],
    ['giao cho ai đó', 'assignment'],
    // The user NAMED the person → mutate (A2).
    ['assign Tuấn to this task', 'mutate'],
    ['giao task này cho Tuấn', 'mutate'],
    ['reassign this to Alice', 'mutate'],
    ['đổi người phụ trách sang Tuấn', 'mutate'],
    ['thay Bình bằng Tuấn trên task này', 'mutate'],
    ['unassign Tuấn from this task', 'mutate'],
    ['giao thêm cho Tuấn', 'mutate'],
    // Unchanged intents, kept in the table because the regex edits could steal
    // them.
    ['đóng các task tagged infra', 'mutate'],
    ['close the deploy task', 'mutate'],
    ['list tasks with the infra label', 'assignment'],
    ['tìm task về migration', 'assignment'],
    ['plan my week', 'weekly_planner'],
    ['lập kế hoạch tuần', 'weekly_planner'],
    ['what is the deadline for the deploy task', 'planner_qna'],
  ];

  it.each(cases)('%s → %s', async (text, expected) => {
    expect(await classify(text)).toBe(expected);
  });

  // inferIntentFromHistory mirrors the same order, so a bare "ok" continues on
  // the runtime that produced the card the user is answering.
  it.each(cases)('confirmation after "%s" stays on %s', async (text, expected) => {
    expect(await classify('ok', [{ role: 'user', content: text }])).toBe(expected);
  });
});

describe('ADJUST_RE — adjusting the open preview reaches A2 (FUT-840)', () => {
  // A classifier that must never fall through: reaching the LLM means the
  // regex missed, and the LLM fallback defaults toward planner_qna, whose
  // read-only agent answers by refusing.
  const classify = makeIntentClassifier({
    resolveModel: () => {
      throw new Error('resolveModel must not be reached');
    },
    classifyLlm: async () => {
      throw new Error('the LLM fallback must not be reached for these phrasings');
    },
  });

  it.each([
    'make it next Friday',
    'instead make it Friday',
    'no wait, Friday',
    'à không, thứ Sáu tuần sau',
    'thay vào đó cho sang thứ Sáu',
    'để tuần sau đi',
  ])('routes %j to mutate', async (text) => {
    expect(await classify(text)).toBe('mutate');
  });

  it.each([
    // Caught by RECOMMEND_RE ("who should"), which runs FIRST — the agent must
    // choose the person, so this belongs to the recommend pipeline even though it
    // contains "instead".
    ['who should do this instead?', 'assignment'],
    // Caught by QUESTION_RE ("what"), which runs BEFORE ADJUST_RE. This ordering
    // is the entire reason design D12 places ADJUST_RE where it does: the "make
    // it" cue would otherwise pull a question into mutate.
    ['what should I make it?', 'planner_qna'],
    // Caught by ACTION_RE ("tìm task"), which runs before ADJUST_RE.
    ['à không, tìm task khác', 'assignment'],
  ])('does NOT let ADJUST_RE steal %j — it stays %s', async (text, expected) => {
    expect(await classify(text)).toBe(expected);
  });

  it('routes an ASSIGN-shaped adjustment to mutate, so it reaches A2 like any other', async () => {
    // The regression pin for a misreading a reviewer actually made: ASSIGN_RE
    // returns 'mutate', which route-chat dispatches to A2 — so an assign revision
    // is NOT special-cased and arrives with openPreview like everything else.
    expect(await classify('giao cho Tuấn thay vào đó')).toBe('mutate');
  });

  it('keeps a bare adjustment out of the LLM even with no preview open', async () => {
    // ADJUST_RE is deliberately NOT gated on whether a preview is open (D12):
    // with none open the sentence still reaches A2, which has no target and asks
    // — the behaviour AC3's fourth row requires.
    expect(await classify('make it next Friday')).toBe('mutate');
  });
});

describe('inferIntentFromHistory covers ADJUST_RE too (FUT-840)', () => {
  it('continues on mutate after a bare "ok" following an adjustment', async () => {
    const classify = makeIntentClassifier({
      resolveModel: () => {
        throw new Error('resolveModel must not be reached');
      },
      classifyLlm: async () => {
        throw new Error('the LLM fallback must not be reached');
      },
    });
    // Without ADJUST_RE in the history scan, the previous turn matches nothing
    // and the confirmation falls through to the LLM.
    expect(await classify('ok, do it', [{ role: 'user', content: 'make it next Friday' }])).toBe(
      'mutate',
    );
  });
});
