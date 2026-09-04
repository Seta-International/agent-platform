import { describe, expect, it } from 'vitest';
import { instructionsText } from '../../../../src/backend/orchestration/action/orchestrator.ts';

describe('A2 instructions', () => {
  it('no longer claims it cannot change several tasks at once', () => {
    expect(instructionsText()).not.toMatch(/change several tasks at once/i);
  });

  it('states the 20-task cap and forbids splitting a larger request', () => {
    const text = instructionsText();
    expect(text).toMatch(/20 tasks/);
    expect(text).toMatch(/never split/i);
  });

  // The conversation only remembers 10 recent tasks, but a batch may be 20, so
  // ordinals physically cannot address the back half. The prompt has to say that
  // out loud or the model will confidently pass "#14".
  it('tells the model to pass taskIds, not ordinals, for a large batch', () => {
    const text = instructionsText();
    expect(text).toMatch(/taskId/);
    expect(text).toMatch(/last 10|10 tasks/i);
  });

  it('still refuses the things A2 genuinely cannot do in this story', () => {
    const text = instructionsText();
    expect(text).toMatch(/create tasks/i);
    expect(text).toMatch(/who a task is assigned to/i);
    // merge and link arrive in later plans; until then the prompt must say so.
    expect(text).toMatch(/merge tasks/i);
  });
});

describe('A2 instructions — linking', () => {
  it('no longer claims it cannot link tasks', () => {
    expect(instructionsText()).not.toMatch(/cannot[^.]*link tasks/i);
  });

  it('explains the direction of duplicates and blocks', () => {
    const text = instructionsText();
    expect(text).toMatch(/duplicates/i);
    expect(text).toMatch(/blocks/i);
  });

  it('still refuses to merge — that arrives separately', () => {
    expect(instructionsText()).toMatch(/merge tasks/i);
  });
});
