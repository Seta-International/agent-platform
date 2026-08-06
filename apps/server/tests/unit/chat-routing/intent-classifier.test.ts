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
      'reassign this to Bob',
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

  // D3: the assignment path must not regress. Sentences that literally contain
  // "assign" prove nothing — ACTION_RE already catches those. The real risk is a
  // CHANGE VERB plus an ASSIGNMENT NOUN, which matches MUTATE_RE while ACTION_RE
  // never sees it.
  it.each([
    'change the assignee to Tuấn',
    'set owner to Tuấn',
    'đổi người phụ trách sang Tuấn',
    'sửa người được giao task này',
    'giao lại task cho Lan',
    'remove Tuấn from this task',
    'assign task này cho Tuấn',
  ])('keeps %j on the assignment runtime', async (text) => {
    expect(await classify(text)).toBe('assignment');
  });

  it.each(['what is the deadline of the API task?', 'how many open tasks do I have?'])(
    'keeps %j on planner_qna',
    async (text) => {
      expect(await classify(text)).toBe('planner_qna');
    },
  );

  // These three match no regex tier TODAY either — they are pure-Vietnamese, or
  // carry no English question word. The claim under test is therefore not "the
  // rules route them" but "the new mutate tier does not STEAL them": they must
  // still reach the LLM, which decides as it does today.
  it.each(['ai nên làm task này?', 'tìm người biết React', 'task nào của tôi quá hạn?'])(
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

  it('a bare confirmation after an assignment turn stays on assignment', async () => {
    const history = [{ role: 'user' as const, content: 'assign task này cho Tuấn' }];
    expect(await classify('ok', history)).toBe('assignment');
  });
});
