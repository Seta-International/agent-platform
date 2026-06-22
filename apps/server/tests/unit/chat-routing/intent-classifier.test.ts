import { describe, expect, it, vi } from 'vitest';
import { makeIntentClassifier } from '../../../src/chat-routing/intent-classifier.ts';

describe('chat intent classifier (tier 2: staffing vs planner_qna)', () => {
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

  it('routes action/recommend intents to staffing by rules (no LLM call)', async () => {
    const actions = [
      'who should I assign to this task?',
      'find people with skill react for this task',
      'reassign this to Bob',
      'recommend an owner for the launch task',
    ];
    for (const a of actions) {
      expect(await classify(a)).toBe('staffing');
    }
  });

  it('falls back to the LLM seam only for ambiguous text, defaulting safe', async () => {
    const llm = vi.fn(async () => 'staffing' as const);
    const c = makeIntentClassifier({ resolveModel: () => ({}) as never, classifyLlm: llm });
    const out = await c('hmm');
    expect(llm).toHaveBeenCalledOnce();
    expect(out).toBe('staffing');
  });
});
