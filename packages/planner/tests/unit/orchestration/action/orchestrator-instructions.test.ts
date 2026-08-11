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
    expect(text).toMatch(/permanently delete/i);
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
});

describe('A2 instructions — merging', () => {
  it('no longer claims it cannot merge tasks', () => {
    expect(instructionsText()).not.toMatch(/cannot[^.]*merge tasks/i);
  });

  it('tells the model which side of a merge gets trashed', () => {
    expect(instructionsText()).toMatch(/duplicateTaskRef/);
    expect(instructionsText()).toMatch(/trash/i);
  });

  it('still refuses to create tasks or assign people', () => {
    const text = instructionsText();
    expect(text).toMatch(/create tasks/i);
    expect(text).toMatch(/assign/i);
  });
});

describe('A2 instructions — assigning', () => {
  it('no longer claims it cannot change who a task is assigned to', () => {
    expect(instructionsText()).not.toMatch(/cannot[^.]*assigned/i);
  });

  it('states that assigning replaces the whole set', () => {
    expect(instructionsText()).toMatch(/replaces/i);
  });

  // The rule that prevents silent data loss on "thay B bằng A".
  it('tells the model to read the task first for a relative request', () => {
    const text = instructionsText();
    expect(text).toMatch(/planner_getTask FIRST/i);
    expect(text).toMatch(/thay B bằng A|giao thêm/i);
  });

  // D10 in the prompt, so a misroute degrades to a sentence rather than a guess.
  it('tells the model to offer a recommendation when nobody is named', () => {
    expect(instructionsText()).toMatch(/recommendation/i);
  });
});
