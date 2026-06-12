import { describe, expect, it } from 'vitest';
import { groupByThought } from '@/modules/agent/chat-experience/group-by-thought';

describe('groupByThought', () => {
  it('groups reasoning parts that carry summary text', () => {
    expect(groupByThought({ type: 'reasoning', text: 'weighing the options' })).toEqual([
      'group-thought',
    ]);
  });

  it('does NOT group an empty reasoning part', () => {
    // OpenAI reasoning models emit a `reasoning` part with no summary text
    // (encrypted content withheld). Grouping it spawns a "Thought · 1 step"
    // disclosure that expands to nothing, because ReasoningPart renders null.
    expect(groupByThought({ type: 'reasoning', text: '' })).toBeNull();
    expect(groupByThought({ type: 'reasoning' })).toBeNull();
  });

  it('groups tool-call parts', () => {
    expect(groupByThought({ type: 'tool-call' })).toEqual(['group-thought']);
  });

  it('does not group plain text parts', () => {
    expect(groupByThought({ type: 'text', text: 'hello' })).toBeNull();
  });
});
